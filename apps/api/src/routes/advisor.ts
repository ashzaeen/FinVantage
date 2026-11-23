import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { formatUsd, routes, speechChunks, type AdvisorMessage, type Situation, type SpeakResponse } from "@finvantage/contracts";
import { generateOptions, runAdvisorTurn } from "@finvantage/llm";
import { buildAdvisorBrief } from "../advisor/brief";
import { advisorReadApi, forModel, oddsRange, type AdvisorReadApi } from "../advisor/read-api";
import { advisorTools } from "../advisor/tools";
import { buildVisual } from "../advisor/visuals";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

/** Earlier messages replayed to the model each turn. Older ones stay saved, just not resent. */
const HISTORY_LIMIT = 20;
const NEW_TITLE = "New conversation";

/** What a conversation was opened about, in the brief so the first answer can start there. */
async function describeSituation(api: AdvisorReadApi, situation: Situation | null) {
  if (!situation) return null;
  if (situation.kind === "user_question") return { kind: situation.kind, question: situation.question };
  if (situation.kind === "copilot_event") {
    const event = (await api.listCopilotEvents()).find((e) => e.id === situation.eventId);
    return event
      ? {
          kind: situation.kind,
          scan: {
            id: event.id,
            merchant: event.merchant,
            pageType: event.pageType,
            price: formatUsd(event.extractedPriceCents),
            verdict: event.metrics.verdict,
            card: { impact: event.card.impact, tradeOff: event.card.tradeOff, smartMove: event.card.smartMove },
            metrics: forModel(event.metrics),
          },
        }
      : null;
  }
  const runs = await api.listSimulationRuns();
  const run = runs.find((r) => r.id === situation.runId);
  if (!run) return null;
  const goals = await api.listGoals();
  return {
    kind: situation.kind,
    run: {
      id: run.id,
      at: run.createdAt,
      goals: run.goalOutcomes.map((o) => ({
        goal: goals.find((g) => g.id === o.goalId)?.name ?? o.goalId,
        likelihood: oddsRange(o.probabilityLow, o.probabilityHigh),
      })),
    },
  };
}

export async function advisorAnswer(
  app: Hono<AppEnv>,
  deps: AppDeps,
  userId: string,
  authorization: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  situation: Situation | null,
  voice = false,
) {
  const api = advisorReadApi(app, deps, userId, authorization);
  const [brief, openedAbout, user] = await Promise.all([
    buildAdvisorBrief(api, deps.today()),
    describeSituation(api, situation).catch(() => null),
    deps.ledger.getUser(userId),
  ]);
  if (openedAbout) brief.brief.openedAbout = openedAbout;
  const userTexts = history.filter((m) => m.role === "user").map((m) => m.content);
  // Account names are bank product names ("PNC Checking"), which are fine to search for.
  const privateNames = [user?.displayName ?? "", user?.email ?? ""].filter(Boolean);
  const tools = advisorTools({ api, deps, userId, brief, userTexts, privateNames });
  const result = await runAdvisorTurn(deps.llm, {
    brief: brief.brief,
    briefLines: brief.lines,
    history,
    tools,
    voice,
  });
  if (result.source === "fallback" && deps.llm.provider !== "mock") {
    console.warn(`Advisor: safe answer used (${result.trace.fallbackReason}); tools ${result.trace.toolCalls.join(", ") || "none"}; rejected ${result.trace.rejected.join(" | ") || "none"}`);
  }
  return result;
}

/** Audio already made for a reply part, so a replay or a retry does not pay for it twice. Oldest out first. */
const SPEECH_CACHE_LIMIT = 40;
const speechCache = new Map<string, SpeakResponse>();

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
}

export function registerAdvisorRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  // Stateless chat, kept for older clients. Nothing is saved.
  mount(app, deps, routes.advisorChat, async ({ userId, body, authorization }) => {
    const result = await advisorAnswer(app, deps, userId, authorization, body.messages, null);
    return { answer: result.answer, source: result.source };
  });

  mount(app, deps, routes.listAdvisorConversations, ({ userId }) =>
    deps.docs.listAdvisorConversations(userId),
  );

  mount(app, deps, routes.createAdvisorConversation, ({ userId, body }) => {
    const now = deps.now();
    return deps.docs.saveAdvisorConversation({
      id: randomUUID(),
      userId,
      title: body.situation?.kind === "copilot_event"
        ? "About a Copilot scan"
        : body.situation?.kind === "simulation_change"
          ? "About a simulation change"
          : NEW_TITLE,
      situation: body.situation ?? null,
      createdAt: now,
      updatedAt: now,
    });
  });

  mount(app, deps, routes.getAdvisorConversation, async ({ userId, params }) => {
    const conversation = await deps.docs.getAdvisorConversation(userId, params.id ?? "");
    if (!conversation) throw new HttpError(404, "not_found", "Conversation not found.");
    return { ...conversation, messages: await deps.docs.listAdvisorMessages(userId, conversation.id) };
  });

  mount(app, deps, routes.deleteAdvisorConversation, async ({ userId, params }) => {
    if (!(await deps.docs.deleteAdvisorConversation(userId, params.id ?? ""))) {
      throw new HttpError(404, "not_found", "Conversation not found.");
    }
    return { deleted: true as const };
  });

  mount(app, deps, routes.sendAdvisorMessage, async ({ userId, params, body, authorization }) => {
    const conversation = await deps.docs.getAdvisorConversation(userId, params.id ?? "");
    if (!conversation) throw new HttpError(404, "not_found", "Conversation not found.");
    const earlier = await deps.docs.listAdvisorMessages(userId, conversation.id);

    const userMessage: AdvisorMessage = {
      id: randomUUID(),
      conversationId: conversation.id,
      role: "user",
      content: body.content,
      source: null,
      citations: [],
      attachments: [],
      createdAt: deps.now(),
    };
    await deps.docs.appendAdvisorMessage(userId, userMessage);

    const history = [...earlier, userMessage]
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));
    const result = await advisorAnswer(app, deps, userId, authorization, history, conversation.situation, body.modality === "voice");

    const reply = await deps.docs.appendAdvisorMessage(userId, {
      id: randomUUID(),
      conversationId: conversation.id,
      role: "assistant",
      content: result.answer,
      source: result.source,
      citations: result.citations,
      attachments: result.attachments,
      ...(result.source === "fallback"
        ? {
            diagnostics: {
              fallbackReason: result.trace.fallbackReason,
              rejected: result.trace.rejected,
              toolCalls: result.trace.toolCalls,
              toolErrors: result.trace.toolErrors,
            },
          }
        : {}),
      createdAt: deps.now(),
    });
    await deps.docs.saveAdvisorConversation({
      ...conversation,
      title: conversation.title === NEW_TITLE ? titleFrom(body.content) : conversation.title,
      updatedAt: reply.createdAt,
    });
    return { userMessage, reply };
  });

  // Speaks a saved reply, one chunk at a time. It never takes free text, so only an answer that
  // already passed the number guardrail can be voiced, and the endpoint is no general speech proxy.
  mount(app, deps, routes.speakAdvisorReply, async ({ userId, body }) => {
    if (!deps.llm.speak) throw new HttpError(503, "voice_unavailable", "Spoken replies are not available.");
    const conversation = await deps.docs.getAdvisorConversation(userId, body.conversationId);
    if (!conversation) throw new HttpError(404, "not_found", "Conversation not found.");
    const message = (await deps.docs.listAdvisorMessages(userId, conversation.id)).find(
      (m) => m.id === body.messageId && m.role === "assistant",
    );
    if (!message) throw new HttpError(404, "not_found", "Reply not found.");
    const chunks = speechChunks(message.content);
    const text = chunks[body.part];
    if (text === undefined) throw new HttpError(404, "not_found", "That part of the reply does not exist.");

    const key = `${userId}:${message.id}:${body.part}`;
    const cached = speechCache.get(key);
    if (cached) return cached;
    let audio;
    try {
      audio = await deps.llm.speak({ text });
    } catch (error) {
      console.warn(`Advisor speech: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpError(503, "voice_unavailable", "Spoken replies are not available right now.");
    }
    const response: SpeakResponse = { audioBase64: audio.audioBase64, mimeType: audio.mimeType, part: body.part, parts: chunks.length };
    speechCache.set(key, response);
    if (speechCache.size > SPEECH_CACHE_LIMIT) speechCache.delete(speechCache.keys().next().value!);
    return response;
  });

  mount(app, deps, routes.renderAdvisorVisual, ({ userId, body, authorization }) =>
    buildVisual({ deps, userId, api: advisorReadApi(app, deps, userId, authorization) }, body),
  );

  mount(app, deps, routes.listRecommendations, ({ userId }) => deps.docs.listRecommendations(userId));

  mount(app, deps, routes.getAdvice, async ({ userId, body }) => {
    const [goals, runs] = await Promise.all([
      deps.ledger.listGoals(userId),
      deps.docs.listSimulationRuns(userId),
    ]);
    const options = await generateOptions(deps.llm, {
      situation: body.situation,
      goals,
      latestRunId: runs[0]?.id ?? null,
    });
    return deps.docs.saveRecommendation({
      id: randomUUID(),
      userId,
      situation: body.situation,
      options,
      createdAt: deps.now(),
    });
  });
}
