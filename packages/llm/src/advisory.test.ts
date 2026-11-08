import assert from "node:assert/strict";
import { test } from "node:test";
import { runAdvisorTurn, type AdvisorTool } from "./advisory";
import type { LlmChatRequest, LlmClient, LlmMessage } from "./client";

type ModelTurn = Extract<LlmMessage, { role: "model" }>;

/** Replies with each scripted turn in order, and records every request. */
function scripted(turns: Array<Partial<ModelTurn> | Error>, requests: LlmChatRequest[] = []): LlmClient {
  let i = 0;
  return {
    provider: "test",
    generate: async () => { throw new Error("unused"); },
    chat: async (request) => {
      requests.push(structuredClone(request));
      const turn = turns[i++];
      if (!turn || turn instanceof Error) throw turn ?? new Error("script ran out");
      return { message: { role: "model", text: null, functionCalls: [], ...turn } };
    },
  };
}

const budgets: AdvisorTool = {
  name: "get_budgets",
  description: "Budgets",
  parameters: { type: "object", properties: {} },
  run: async () => ({
    data: [{ category: "Dining", spentCents: 45_000, limitCents: 40_000 }],
    citation: "Budgets",
    summary: ["Dining: $450.00 spent of a $400.00 budget."],
  }),
};

const base = {
  brief: { netWorthCents: 1_250_000 },
  briefLines: ["Net worth: $12,500.00."],
  history: [{ role: "user" as const, content: "Why is dining red?" }],
  tools: [budgets],
};

test("calls a tool, feeds the result back, and accepts a grounded answer", async () => {
  const requests: LlmChatRequest[] = [];
  const llm = scripted([
    { functionCalls: [{ name: "get_budgets", args: {} }] },
    { text: "You spent $450 on dining against a $400 budget." },
  ], requests);
  const result = await runAdvisorTurn(llm, base);
  assert.equal(result.source, "gemini");
  assert.equal(result.answer, "You spent $450 on dining against a $400 budget.");
  assert.deepEqual(result.citations, [{ tool: "Budgets", label: "Budgets" }]);
  const toolTurn = requests[1]!.messages.at(-1);
  assert.equal(toolTurn?.role, "tool");
  assert.match(requests[0]!.system, /12500/, "the brief goes in with the system prompt");
});

test("an invented number gets one retry that names it", async () => {
  const requests: LlmChatRequest[] = [];
  const llm = scripted([
    { text: "Cut $175 a month." },
    { text: "Trimming dining would help your $12,500 net worth grow." },
  ], requests);
  const result = await runAdvisorTurn(llm, base);
  assert.equal(result.source, "gemini");
  const nudge = requests[1]!.messages.at(-1);
  assert.equal(nudge?.role, "user");
  assert.match(nudge?.role === "user" ? nudge.text : "", /175/);
});

test("a second invented number falls back to the safe answer written in code", async () => {
  const llm = scripted([
    { functionCalls: [{ name: "get_budgets", args: {} }] },
    { text: "Cut $175 a month." },
    { text: "Cut $180 a month." },
  ]);
  const result = await runAdvisorTurn(llm, base);
  assert.equal(result.source, "fallback");
  assert.match(result.answer, /Dining: \$450\.00 spent/);
  assert.doesNotMatch(result.answer, /175|180/);
  assert.doesNotMatch(result.answer, /Net worth/, "once tools ran, the general brief stays out");
  assert.deepEqual(result.citations, [{ tool: "Budgets", label: "Budgets" }], "citations survive the fallback");
});

test("a provider failure, or no chat support, still answers from the brief", async () => {
  for (const llm of [scripted([new Error("down")]), { provider: "plain", generate: async () => "" } as LlmClient]) {
    const result = await runAdvisorTurn(llm, base);
    assert.equal(result.source, "fallback");
    assert.match(result.answer, /unavailable/);
    assert.match(result.answer, /Net worth: \$12,500\.00/);
  }
});

test("a failing tool reports its error to the model instead of ending the turn", async () => {
  const requests: LlmChatRequest[] = [];
  const broken: AdvisorTool = { ...budgets, run: async () => { throw new Error("store offline"); } };
  const llm = scripted([
    { functionCalls: [{ name: "get_budgets", args: {} }, { name: "nope", args: {} }] },
    { text: "I couldn't load your budgets just now." },
  ], requests);
  const result = await runAdvisorTurn(llm, { ...base, tools: [broken] });
  assert.equal(result.source, "gemini");
  const toolTurn = requests[1]!.messages.at(-1);
  assert.deepEqual(toolTurn?.role === "tool" && toolTurn.results.map((r) => r.response.error), ["store offline", "No tool named nope."]);
});

test("tool rounds are capped, then the model must answer without tools", async () => {
  const requests: LlmChatRequest[] = [];
  const call = { functionCalls: [{ name: "get_budgets", args: {} }] };
  const llm = scripted([call, call, call, call, { text: "Done." }], requests);
  const result = await runAdvisorTurn(llm, base);
  assert.equal(result.answer, "Done.");
  assert.equal(requests[4]!.tools, undefined);
});

test("attachments from tools come back with the answer", async () => {
  const draftTool: AdvisorTool = {
    name: "draft_life_event",
    description: "Draft",
    parameters: { type: "object", properties: {} },
    run: async () => ({
      data: { draft: "child" },
      citation: "Life event draft",
      attachment: {
        kind: "life_event_draft",
        draft: { type: "child", date: "2027-03-01", recurrence: "recurring", dollarImpactCents: -150_000, durationMonths: 216, linkedGoalId: null, source: "parsed" },
        goalChanges: [],
      },
    }),
  };
  const llm = scripted([
    { functionCalls: [{ name: "draft_life_event", args: { text: "baby in March" } }] },
    { text: "Congratulations! Review the draft card and press Confirm if it looks right." },
  ]);
  const result = await runAdvisorTurn(llm, { ...base, tools: [draftTool] });
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]!.kind, "life_event_draft");
});

test("a second bad amount keeps the on-topic answer without that sentence", async () => {
  const general = "Keep card balances under 30% of your limits and pay on time every month.";
  const llm = scripted([
    { text: `${general} You could save $9,999 a year doing this.` },
    { text: `${general} That could save you $8,888 a year, and paying in full avoids interest entirely.` },
  ]);
  const result = await runAdvisorTurn(llm, base);
  assert.equal(result.source, "fallback");
  assert.match(result.answer, /under 30% of your limits/);
  assert.doesNotMatch(result.answer, /8,888|9,999/);
  assert.match(result.answer, /left out an amount/);
});
