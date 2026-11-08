import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { SimulationInputs, SimulationRequest, SimulationRun, WhatIf } from "@finvantage/contracts";
import { buildSnapshot } from "@finvantage/data";
import { simulate } from "@finvantage/simulator";
import type { AppDeps } from "./deps";
import { HttpError } from "./mount";
import { averageCashFlow, monthlyCashFlow, monthsBefore } from "./reporting/cashflow";

/** Months of bank history averaged for a linked user's monthly income, spending and savings. */
const CASH_FLOW_MONTHS = 3;

/**
 * Null when the user has no linked data. With `bankCashFlow`, a user with a linked bank gets
 * monthly income, spending and savings from their transactions instead of the profile.
 */
export async function loadInputs(
  deps: AppDeps,
  userId: string,
  whatIf: WhatIf | null,
  options: { bankCashFlow?: boolean } = {},
): Promise<SimulationInputs | null> {
  const [user, income, accounts, goals, lifeEvents, bankItems] = await Promise.all([
    deps.ledger.getUser(userId),
    deps.ledger.getIncomeProfile(userId),
    deps.ledger.listAccounts(userId),
    deps.ledger.listGoals(userId),
    deps.docs.listLifeEvents(userId),
    deps.ledger.listBankItems(userId),
  ]);
  if (!user || !income || accounts.length === 0) return null;
  const snapshot = buildSnapshot(user, accounts, income, deps.today());
  if (options.bankCashFlow && bankItems.length > 0) {
    // A linked bank knows what actually comes in and goes out, so it replaces the profile's
    // estimates. The profile stays the fallback while the bank has no full month of history.
    const months = monthsBefore(deps.today().slice(0, 7), CASH_FLOW_MONTHS);
    const flow = averageCashFlow(monthlyCashFlow(await deps.ledger.listTransactions(userId, 5_000), months), {
      complete: true,
    });
    if (flow) {
      snapshot.monthlyIncomeCents = flow.incomeCents;
      snapshot.monthlySpendingCents = flow.spendingCents;
      snapshot.monthlySavingsCents = flow.savingsCents;
    }
  }
  return { snapshot, goals, lifeEvents, whatIf };
}

export async function runSimulation(
  deps: AppDeps,
  userId: string,
  request: z.output<typeof SimulationRequest>,
): Promise<SimulationRun> {
  const inputs = await loadInputs(deps, userId, request.whatIf ?? null, { bankCashFlow: true });
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
