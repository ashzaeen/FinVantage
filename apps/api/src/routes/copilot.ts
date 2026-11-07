import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import { generateCopilotCard } from "@finvantage/llm";
import { computeCopilotMetrics } from "@finvantage/math-core";
import { evaluatePurchase } from "@finvantage/simulator";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { loadInputs } from "../services";

export function registerCopilotRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.evaluateCopilot, async ({ userId, body }) => {
    const inputs = await loadInputs(deps, userId, null);
    if (!inputs) return { status: "no_data" as const };

    // Order matters: simulator, then math core, then LLM. Words come last.
    const isOneTime = body.pageType === "checkout";
    const goalImpacts = evaluatePurchase(inputs, {
      amountCents: isOneTime ? body.priceCents : 0,
      monthlyCents: body.pageType === "rental" ? body.priceCents : 0,
    });
    const metrics = computeCopilotMetrics(inputs.snapshot, body, goalImpacts);
    const card = await generateCopilotCard(deps.llm, body, metrics);

    const event = await deps.docs.saveCopilotEvent({
      id: randomUUID(),
      userId,
      pageType: body.pageType,
      merchant: body.merchant,
      extractedPriceCents: body.priceCents,
      metrics,
      card,
      userAction: null,
      createdAt: new Date().toISOString(),
    });
    deps.live.publish(userId, { type: "copilot.event", event });

    return {
      status: "ok" as const,
      eventId: event.id,
      metrics,
      card,
      simulationPath: `/simulator?copilotEvent=${event.id}`,
    };
  });

  mount(app, deps, routes.recordCopilotAction, async ({ userId, params, body }) => {
    const event = await deps.docs.setCopilotAction(userId, params.id ?? "", body.action);
    if (!event) throw new HttpError(404, "not_found", "Copilot event not found.");
    return event;
  });

  mount(app, deps, routes.listCopilotEvents, ({ userId }) => deps.docs.listCopilotEvents(userId));
}
