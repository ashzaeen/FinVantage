import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import { parseLifeEvent } from "@finvantage/llm";
import { diffOutcomes } from "@finvantage/simulator";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { previewLifeEvent, runSimulation } from "../services";

export function registerLifeEventRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listLifeEvents, ({ userId }) => deps.docs.listLifeEvents(userId));

  // Never saves. The client shows the draft, then POSTs it after the user confirms.
  mount(app, deps, routes.parseLifeEvent, ({ body }) =>
    parseLifeEvent(deps.llm, body.text, deps.today()),
  );

  mount(app, deps, routes.previewLifeEvent, ({ userId, body }) =>
    previewLifeEvent(deps, userId, body),
  );

  mount(app, deps, routes.deleteLifeEvent, async ({ userId, params }) => {
    if (!(await deps.docs.deleteLifeEvent(userId, params.id ?? ""))) {
      throw new HttpError(404, "not_found", "No such life event.");
    }
    // A fresh saved run, so goal odds everywhere stop counting the event straight away.
    return { deleted: true as const, run: await runSimulation(deps, userId, { persist: true }) };
  });

  mount(app, deps, routes.createLifeEvent, async ({ userId, body }) => {
    const before = await runSimulation(deps, userId, { persist: false });
    const event = await deps.docs.saveLifeEvent({ ...body, id: randomUUID(), userId });
    const run = await runSimulation(deps, userId, { persist: true });
    return { event, run, goalChanges: diffOutcomes(run.inputs.goals, before, run) };
  });
}
