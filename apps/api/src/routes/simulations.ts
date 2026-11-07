import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import { diffOutcomes } from "@finvantage/simulator";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { runSimulation } from "../services";

export function registerSimulationRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.runSimulation, ({ userId, body }) => runSimulation(deps, userId, body));

  mount(app, deps, routes.listSimulations, ({ userId }) => deps.docs.listSimulationRuns(userId));

  const getRun = async (userId: string, id: string | undefined) => {
    const run = await deps.docs.getSimulationRun(userId, id ?? "");
    if (!run) throw new HttpError(404, "not_found", "Simulation run not found.");
    return run;
  };

  mount(app, deps, routes.getSimulation, ({ userId, params }) => getRun(userId, params.id));

  // Diffs read stored runs and never recalculate (PRD section 9).
  mount(app, deps, routes.diffSimulations, async ({ userId, params }) => {
    const from = await getRun(userId, params.id);
    const to = await getRun(userId, params.otherId);
    return { fromRunId: from.id, toRunId: to.id, goals: diffOutcomes(to.inputs.goals, from, to) };
  });
}
