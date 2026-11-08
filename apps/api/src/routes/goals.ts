import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

export function registerGoalRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listGoals, ({ userId }) => deps.ledger.listGoals(userId));
  mount(app, deps, routes.createGoal, ({ userId, body }) => deps.ledger.createGoal(userId, body));
  mount(app, deps, routes.updateGoal, async ({ userId, params, body }) => {
    const goal = await deps.ledger.updateGoal(userId, params.id, body);
    if (!goal) throw new HttpError(404, "not_found", "Goal not found.");
    return goal;
  });
  mount(app, deps, routes.deleteGoal, async ({ userId, params }) => {
    const deleted = await deps.ledger.deleteGoal(userId, params.id);
    if (!deleted) throw new HttpError(404, "not_found", "Goal not found.");
    return { deleted: true as const };
  });
}
