import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

export function registerGoalRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listGoals, ({ userId }) => deps.ledger.listGoals(userId));
  mount(app, deps, routes.createGoal, ({ userId, body }) => deps.ledger.createGoal(userId, body));
}
