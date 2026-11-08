import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  routes,
  type LifeEventType,
  type LifeScenario,
  type LifeScenarioAnalyzeRequest,
  type LifeScenarioAnalysis,
  type LifeScenarioEventType,
  type LifeScenarioInput,
  type LifeSimulatorContext,
  type NewGoal,
  type NewLifeScenario,
} from "@finvantage/contracts";
import { analyzeLifeScenario, LifeScenarioValidationError } from "@finvantage/math-core";
import type { AppDeps } from "../deps";
import { mount, HttpError, type AppEnv } from "../mount";
import { createLifeScenarioPdf } from "../reporting/life-scenario-pdf";
import { runSimulation } from "../services";
import { buildLifeSimulatorContext } from "./life-simulator";

/** A scenario's event type doesn't map one-to-one onto LifeEventType, but every value here has a
 * direct match today: "confirm" creates a real LifeEvent and both enums need to stay in step. */
const EVENT_TYPE_MAP: Record<LifeScenarioEventType, LifeEventType> = {
  new_baby: "child",
  buy_home: "house_purchase",
  job_change: "job_change",
  move_city: "move",
  wedding: "wedding",
  custom: "custom",
};

function toAnalyzeRequest(scenario: LifeScenarioInput, context: LifeSimulatorContext): LifeScenarioAnalyzeRequest {
  return { ...scenario, goals: context.goals, freeCashCents: context.freeCashCents, asOf: context.asOf };
}

async function analyzeScenario(deps: AppDeps, userId: string, scenario: LifeScenarioInput): Promise<LifeScenarioAnalysis> {
  const context = await buildLifeSimulatorContext(deps, userId);
  try {
    return analyzeLifeScenario(toAnalyzeRequest(scenario, context));
  } catch (error) {
    if (error instanceof LifeScenarioValidationError) throw new HttpError(400, error.code, error.message);
    throw error;
  }
}

async function getOwnedScenario(deps: AppDeps, userId: string, id: string): Promise<LifeScenario> {
  const scenario = await deps.docs.getLifeScenario(userId, id);
  if (!scenario) throw new HttpError(404, "not_found", "No such scenario.");
  return scenario;
}

export function registerLifeScenarioRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listLifeScenarios, ({ userId }) => deps.docs.listLifeScenarios(userId));

  mount(app, deps, routes.exportLifeScenarioPdf, async ({ userId, body }) => {
    const context = await buildLifeSimulatorContext(deps, userId);
    let analysis: LifeScenarioAnalysis;
    try {
      analysis = analyzeLifeScenario(toAnalyzeRequest(body, context));
    } catch (error) {
      if (error instanceof LifeScenarioValidationError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
    const pdf = await createLifeScenarioPdf(body, context, analysis, deps.now());
    const eventName = body.eventType === "custom" ? body.customEventName || "event" : body.eventType.replaceAll("_", "-");
    const safeName = eventName.normalize("NFKD").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "life-event";
    return { filename: `${safeName}-comparison.pdf`, base64: pdf.toString("base64") };
  });

  mount(app, deps, routes.createLifeScenario, async ({ userId, body }) => {
    await analyzeScenario(deps, userId, body); // validates before saving; the result itself isn't needed here
    const now = deps.now();
    const scenario: LifeScenario = {
      ...body,
      id: randomUUID(),
      userId,
      status: "saved",
      appliedLifeEventIds: [],
      appliedGoalTargetDates: [],
      createdAt: now,
      updatedAt: now,
    };
    return deps.docs.saveLifeScenario(scenario);
  });

  mount(app, deps, routes.getLifeScenario, ({ userId, params }) => getOwnedScenario(deps, userId, params.id!));

  mount(app, deps, routes.updateLifeScenario, async ({ userId, params, body }) => {
    const existing = await getOwnedScenario(deps, userId, params.id!);
    if (existing.status !== "saved") {
      throw new HttpError(409, "scenario_applied", "Undo this scenario before editing it.");
    }
    await analyzeScenario(deps, userId, body);
    const updated: LifeScenario = { ...existing, ...body, updatedAt: deps.now() };
    return deps.docs.saveLifeScenario(updated);
  });

  mount(app, deps, routes.deleteLifeScenario, async ({ userId, params }) => {
    const existing = await getOwnedScenario(deps, userId, params.id!);
    if (existing.status === "applied") {
      throw new HttpError(409, "scenario_applied", "Undo this scenario before deleting it.");
    }
    const deleted = await deps.docs.deleteLifeScenario(userId, params.id!);
    return { deleted: deleted as true };
  });

  // Apply: a draft only. It previews the real effect but never touches a goal or saves a life event.
  mount(app, deps, routes.applyLifeScenario, async ({ userId, params }) => {
    const existing = await getOwnedScenario(deps, userId, params.id!);
    const preview = await analyzeScenario(deps, userId, existing);
    if (existing.status !== "saved") return { scenario: existing, preview }; // idempotent: already drafted or applied
    const scenario: LifeScenario = { ...existing, status: "draft_applied", updatedAt: deps.now() };
    await deps.docs.saveLifeScenario(scenario);
    return { scenario, preview };
  });

  // Confirm: the one step that changes real data. Create the life event(s), then shift each
  // affected goal's targetDate to its new projected date, capturing prior values for undo. This is
  // a sequential, compensating-rollback sequence, not a native transaction — life events live in
  // MongoDB and goals live in the ledger store (Spacetime or memory), two different systems with no
  // shared transaction boundary in this codebase. See docs/DECISIONS.md.
  mount(app, deps, routes.confirmLifeScenario, async ({ userId, params }) => {
    const existing = await getOwnedScenario(deps, userId, params.id!);
    if (existing.status === "applied") {
      return { scenario: existing, updatedGoalIds: existing.appliedGoalTargetDates.map((g) => g.goalId), lifeEventIds: existing.appliedLifeEventIds };
    }
    if (existing.status !== "draft_applied") {
      throw new HttpError(409, "not_applied", "Apply this scenario before confirming it.");
    }

    const preview = await analyzeScenario(deps, userId, existing);
    const goals = await deps.ledger.listGoals(userId);
    const now = deps.now();
    const eventDate = existing.startMonth;
    const baseEvent = { type: EVENT_TYPE_MAP[existing.eventType], date: eventDate, source: "form" as const, linkedGoalId: null };

    const lifeEventIds: string[] = [];
    const savedEventIds: string[] = [];
    const updatedGoals: Array<{ goalId: string; previousTargetDate: string }> = [];
    try {
      if (existing.monthlyCostCents > 0) {
        const id = randomUUID();
        await deps.docs.saveLifeEvent({
          ...baseEvent, id, userId, recurrence: "recurring", dollarImpactCents: -existing.monthlyCostCents, durationMonths: null,
        });
        lifeEventIds.push(id);
        savedEventIds.push(id);
      }
      if (existing.oneTimeCostCents > 0) {
        const id = randomUUID();
        await deps.docs.saveLifeEvent({
          ...baseEvent, id, userId, recurrence: "one_time", dollarImpactCents: -existing.oneTimeCostCents, durationMonths: null,
          linkedGoalId: existing.oneTimeSourceGoalId,
        });
        lifeEventIds.push(id);
        savedEventIds.push(id);
      }

      for (const result of preview.goals) {
        if (!result.included || !result.displayDate || result.displayDate === result.beforeDisplayDate) continue;
        const goal = goals.find((g) => g.id === result.goalId);
        if (!goal) continue;
        const { id, userId: goalUserId, ...rest } = goal;
        const update: NewGoal = { ...rest, targetDate: result.displayDate };
        const saved = await deps.ledger.updateGoal(userId, id, update);
        if (saved) updatedGoals.push({ goalId: id, previousTargetDate: goal.targetDate });
      }

      const scenario: LifeScenario = {
        ...existing,
        status: "applied",
        appliedLifeEventIds: lifeEventIds,
        appliedGoalTargetDates: updatedGoals,
        updatedAt: now,
      };
      await deps.docs.saveLifeScenario(scenario);
      await runSimulation(deps, userId, { persist: true }); // keeps the rest of the app's projections in sync
      return { scenario, updatedGoalIds: updatedGoals.map((g) => g.goalId), lifeEventIds };
    } catch (error) {
      // Best-effort compensating rollback: undo whatever partially succeeded before re-throwing.
      for (const update of updatedGoals) {
        const goal = goals.find((g) => g.id === update.goalId);
        if (!goal) continue;
        const { id, userId: goalUserId, ...rest } = goal;
        await deps.ledger.updateGoal(userId, id, { ...rest, targetDate: update.previousTargetDate }).catch(() => {});
      }
      for (const eventId of savedEventIds) await deps.docs.deleteLifeEvent(userId, eventId).catch(() => {});
      throw new HttpError(500, "confirm_failed", error instanceof Error ? error.message : "Could not confirm this scenario.");
    }
  });

  mount(app, deps, routes.undoLifeScenario, async ({ userId, params }) => {
    const existing = await getOwnedScenario(deps, userId, params.id!);
    if (existing.status !== "applied") {
      const scenario: LifeScenario = { ...existing, status: "saved", updatedAt: existing.status === "saved" ? existing.updatedAt : deps.now() };
      if (scenario !== existing) await deps.docs.saveLifeScenario(scenario);
      return { scenario, restoredGoalIds: [] };
    }

    const goals = await deps.ledger.listGoals(userId);
    const restoredGoalIds: string[] = [];
    for (const applied of existing.appliedGoalTargetDates) {
      const goal = goals.find((g) => g.id === applied.goalId);
      if (!goal) continue;
      const { id, userId: goalUserId, ...rest } = goal;
      await deps.ledger.updateGoal(userId, id, { ...rest, targetDate: applied.previousTargetDate });
      restoredGoalIds.push(id);
    }
    for (const eventId of existing.appliedLifeEventIds) await deps.docs.deleteLifeEvent(userId, eventId);

    const scenario: LifeScenario = {
      ...existing,
      status: "saved",
      appliedLifeEventIds: [],
      appliedGoalTargetDates: [],
      updatedAt: deps.now(),
    };
    await deps.docs.saveLifeScenario(scenario);
    await runSimulation(deps, userId, { persist: true });
    return { scenario, restoredGoalIds };
  });
}
