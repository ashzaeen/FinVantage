import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { SimulationInputs, SimulationRequest, SimulationRun, WhatIf } from "@finvantage/contracts";
import { buildSnapshot } from "@finvantage/data";
import { simulate } from "@finvantage/simulator";
import type { AppDeps } from "./deps";
import { HttpError } from "./mount";

/** Null when the user has no linked data. */
export async function loadInputs(
  deps: AppDeps,
  userId: string,
  whatIf: WhatIf | null,
): Promise<SimulationInputs | null> {
  const [user, income, accounts, goals, lifeEvents] = await Promise.all([
    deps.ledger.getUser(userId),
    deps.ledger.getIncomeProfile(userId),
    deps.ledger.listAccounts(userId),
    deps.ledger.listGoals(userId),
    deps.docs.listLifeEvents(userId),
  ]);
  if (!user || !income || accounts.length === 0) return null;
  return { snapshot: buildSnapshot(user, accounts, income, deps.today()), goals, lifeEvents, whatIf };
}

export async function runSimulation(
  deps: AppDeps,
  userId: string,
  request: z.output<typeof SimulationRequest>,
): Promise<SimulationRun> {
  const inputs = await loadInputs(deps, userId, request.whatIf ?? null);
  if (!inputs) throw new HttpError(404, "no_data", "Load the demo profile first.");

  const result = simulate(inputs, { seed: request.seed, paths: request.paths });
  const [previous] = await deps.docs.listSimulationRuns(userId);
  const run: SimulationRun = {
    ...result,
    id: randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
    inputs,
    prioritySetup: inputs.goals.map((g) => ({ goalId: g.id, priorityRank: g.priorityRank })),
    previousRunId: previous?.id ?? null,
    persisted: request.persist,
  };

  if (request.persist) {
    await deps.docs.saveSimulationRun(run);
    deps.live.publish(userId, { type: "simulation.updated", runId: run.id });
  }
  return run;
}
