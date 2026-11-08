import type { Hono } from "hono";
import { routes, type LifeScenarioAnalyzeRequest, type LifeSimulatorContext } from "@finvantage/contracts";
import { analyzeLifeScenario, LifeScenarioValidationError, monthlyNeedForGoal } from "@finvantage/math-core";
import type { AppDeps } from "../deps";
import { mount, HttpError, type AppEnv } from "../mount";
import { loadInputs } from "../services";

function fitGoalContributionsToFreeCash(needs: number[], freeCashCents: number): number[] {
  const totalNeed = needs.reduce((sum, amount) => sum + amount, 0);
  if (totalNeed <= freeCashCents || totalNeed === 0) return needs;

  const exact = needs.map((amount) => (amount / totalNeed) * freeCashCents);
  const fitted = exact.map(Math.floor);
  let remainingCents = freeCashCents - fitted.reduce((sum, amount) => sum + amount, 0);
  const remainderOrder = exact
    .map((amount, index) => ({ index, fraction: amount - fitted[index]! }))
    .sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; remainingCents > 0; index += 1, remainingCents -= 1) {
    fitted[remainderOrder[index % remainderOrder.length]!.index]! += 1;
  }
  return fitted;
}

/** The user's real goals and free cash, shaped for the life simulator. Shared with life-scenarios.ts. */
export async function buildLifeSimulatorContext(deps: AppDeps, userId: string): Promise<LifeSimulatorContext> {
  const inputs = await loadInputs(deps, userId, null);
  if (!inputs) throw new HttpError(404, "no_data", "Load the demo profile first.");
  const { snapshot, goals } = inputs;
  const monthlyNeeds = goals.map((goal) => monthlyNeedForGoal(snapshot.asOf, goal));
  // Individual target dates can imply a combined monthly contribution that exceeds what the
  // household actually saves. In that case, scale the current plan to fit real free cash so the
  // baseline chart and event comparison never model more money than the user has.
  const currentContributions = fitGoalContributionsToFreeCash(monthlyNeeds, snapshot.monthlySavingsCents);
  return {
    asOf: snapshot.asOf,
    // STUB(transactions): free cash is the snapshot's monthly savings figure, same as everywhere
    // else in the app — buildSnapshot documents that it is not yet derived from transaction history.
    freeCashCents: snapshot.monthlySavingsCents,
    goals: goals.map((goal, index) => ({
      id: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      savedCents: goal.currentCents,
      // Goals don't store a contribution rate; this is what the goal needs each month to land on
      // its target date, the same derivation math-core already uses for non-negotiable goals.
      monthlyContributionCents: currentContributions[index]!,
      kind: goal.kind ?? "standard",
      plannedDate: goal.kind === "trip" ? goal.targetDate : null,
    })),
  };
}

export function registerLifeSimulatorRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.getLifeSimulatorContext, ({ userId }) => buildLifeSimulatorContext(deps, userId));

  mount(app, deps, routes.analyzeLifeScenario, async ({ userId, body }) => {
    const context = await buildLifeSimulatorContext(deps, userId);
    const request: LifeScenarioAnalyzeRequest = {
      ...body,
      goals: context.goals,
      freeCashCents: context.freeCashCents,
      asOf: context.asOf,
    };
    try {
      return analyzeLifeScenario(request);
    } catch (error) {
      if (error instanceof LifeScenarioValidationError) throw new HttpError(400, error.code, error.message);
      throw error;
    }
  });
}
