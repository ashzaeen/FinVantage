import {
  ACCOUNT_CATEGORY,
  ACCOUNT_CATEGORY_LABEL,
  formatPercent,
  isLiability,
  type LargestQuarterlyChange,
  type Quarter,
  type ReportEvidence,
  type ReportVisuals,
  SimulationRequest,
  type SimulationRun,
} from "@finvantage/contracts";
import { isDemoCopy } from "@finvantage/data";
import type { AppDeps } from "../deps";
import { runSimulation } from "../services";
import { averageCashFlow, monthlyCashFlow } from "./cashflow";

export class InsufficientQuarterDataError extends Error {}

export interface QuarterWindow {
  quarter: Quarter;
  start: string;
  endExclusive: string;
  endInclusive: string;
}

export function previousQuarter(quarter: Quarter): Quarter {
  const [yearText, quarterText] = quarter.split("-Q");
  const year = Number(yearText);
  const number = Number(quarterText);
  return (number === 1 ? `${year - 1}-Q4` : `${year}-Q${number - 1}`) as Quarter;
}

export function latestCompletedQuarter(today: string): Quarter {
  const date = new Date(`${today}T00:00:00Z`);
  const currentQuarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return previousQuarter(`${date.getUTCFullYear()}-Q${currentQuarter}` as Quarter);
}

export function quarterWindow(quarter: Quarter): QuarterWindow {
  const [yearText, quarterText] = quarter.split("-Q");
  const year = Number(yearText);
  const number = Number(quarterText);
  const startMonth = (number - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  const inclusive = new Date(end.getTime() - 86_400_000);
  return {
    quarter,
    start: start.toISOString().slice(0, 10),
    endExclusive: end.toISOString().slice(0, 10),
    endInclusive: inclusive.toISOString().slice(0, 10),
  };
}

function timestampRange(window: QuarterWindow) {
  return { start: `${window.start}T00:00:00.000Z`, end: `${window.endExclusive}T00:00:00.000Z` };
}

function probabilityRange(run: SimulationRun, goalId: string) {
  const outcome = run.goalOutcomes.find((candidate) => candidate.goalId === goalId);
  if (!outcome) return null;
  return {
    low: outcome.probabilityLow,
    high: outcome.probabilityHigh,
    midpoint: (outcome.probabilityLow + outcome.probabilityHigh) / 2,
    formatted: `${formatPercent(outcome.probabilityLow)} to ${formatPercent(outcome.probabilityHigh)}`,
  };
}

function causeOfChange(previous: SimulationRun, current: SimulationRun): string {
  const before = previous.inputs;
  const after = current.inputs;
  if (before.snapshot.monthlySavingsCents !== after.snapshot.monthlySavingsCents) {
    return after.snapshot.monthlySavingsCents > before.snapshot.monthlySavingsCents
      ? "The stored monthly savings input increased."
      : "The stored monthly savings input decreased.";
  }
  if (
    (before.whatIf?.monthlySavingsDeltaCents ?? 0) !==
    (after.whatIf?.monthlySavingsDeltaCents ?? 0)
  ) {
    return "The saved monthly savings scenario changed.";
  }
  if ((before.whatIf?.purchaseAmountCents ?? 0) !== (after.whatIf?.purchaseAmountCents ?? 0)) {
    return "The saved purchase scenario changed.";
  }
  if (before.lifeEvents.length !== after.lifeEvents.length) {
    return "A stored life event changed the simulation inputs.";
  }
  if (JSON.stringify(previous.prioritySetup) !== JSON.stringify(current.prioritySetup)) {
    return "The stored goal priorities changed.";
  }
  if (previous.seed !== current.seed) return "The stored simulation seed changed.";
  return "No changed input was found in the stored runs, so the cause is not established.";
}

/** The three `YYYY-MM` keys of a quarter. */
function monthKeysOf(quarter: Quarter): string[] {
  const start = quarterWindow(quarter).start;
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  return [0, 1, 2].map((offset) => `${year}-${String(month + offset).padStart(2, "0")}`);
}

export interface EvidenceOptions {
  /**
   * When the quarter has no saved simulation, use the newest one from any date, or run one now.
   * Only for the quarter being generated: a previous quarter must have its own run, or the
   * comparison would set a run against itself.
   */
  fallbackRun?: boolean;
}

export async function buildQuarterlyEvidence(
  deps: AppDeps,
  userId: string,
  requestedQuarter?: Quarter,
  options: EvidenceOptions = {},
) {
  const quarter = requestedQuarter ?? latestCompletedQuarter(deps.today());
  const previous = previousQuarter(quarter);
  const currentWindow = quarterWindow(quarter);
  const previousWindow = quarterWindow(previous);
  // Once a bank is linked the report runs on it. Runs saved before that were simulated on the
  // demo copy's accounts, so they no longer describe the user's money and are skipped.
  const dataSource = (await deps.ledger.listBankItems(userId)).length > 0 ? ("bank" as const) : ("demo" as const);
  const describesUser = (run: SimulationRun) =>
    dataSource === "demo" || !run.inputs.snapshot.accounts.some((account) => isDemoCopy(userId, account.id));
  const runsIn = async (range?: { start: string; end: string }) =>
    (await deps.docs.listSimulationRuns(userId, range)).filter(describesUser);
  const [currentRuns, previousRuns, currentEvents, previousEvents, currentRecommendations, previousRecommendations] =
    await Promise.all([
      runsIn(timestampRange(currentWindow)),
      runsIn(timestampRange(previousWindow)),
      deps.docs.listCopilotEvents(userId, timestampRange(currentWindow)),
      deps.docs.listCopilotEvents(userId, timestampRange(previousWindow)),
      deps.docs.listRecommendations(userId, timestampRange(currentWindow)),
      deps.docs.listRecommendations(userId, timestampRange(previousWindow)),
    ]);
  let currentRun = currentRuns[0];
  let outlookAsOf: string | null = null;
  if (!currentRun && options.fallbackRun) {
    currentRun =
      (await runsIn())[0] ?? (await runSimulation(deps, userId, SimulationRequest.parse({ persist: true })));
    outlookAsOf = currentRun.createdAt.slice(0, 10);
    currentRuns.push(currentRun);
  }
  // A fallback run may sit in the previous quarter; it can't be compared with itself.
  const previousRun = previousRuns.find((run) => run.id !== currentRun?.id);
  if (!currentRun) {
    throw new InsufficientQuarterDataError(
      `A stored simulation run is required for ${quarter}.`,
    );
  }

  const comparisons = previousRun ? currentRun.goalOutcomes.flatMap((outcome) => {
    const before = probabilityRange(previousRun, outcome.goalId);
    const after = probabilityRange(currentRun, outcome.goalId);
    if (!before || !after) return [];
    const goal = currentRun.inputs.goals.find((candidate) => candidate.id === outcome.goalId);
    return [{ goalId: outcome.goalId, goalName: goal?.name ?? "Goal", before, after }];
  }) : [];
  const largest = comparisons.sort(
    (left, right) =>
      Math.abs(right.after.midpoint - right.before.midpoint) -
      Math.abs(left.after.midpoint - left.before.midpoint),
  )[0];
  let largestChange: LargestQuarterlyChange | null = null;
  const evidence: ReportEvidence[] = [];
  if (largest && previousRun) {
    const deltaPoints = Math.round((largest.after.midpoint - largest.before.midpoint) * 100);
    const direction = deltaPoints > 0 ? "higher" : deltaPoints < 0 ? "lower" : "unchanged";
    const change =
      deltaPoints === 0
        ? "The midpoint was unchanged"
        : `The midpoint was ${Math.abs(deltaPoints)} percentage points ${direction}`;
    largestChange = {
      label: `${largest.goalName} probability range`,
      previousValue: largest.before.formatted,
      currentValue: largest.after.formatted,
      change,
      cause: causeOfChange(previousRun, currentRun),
    };
    evidence.push(
      {
        quarter: previous,
        label: largestChange.label,
        value: largest.before.formatted,
        sourceType: "simulation_run",
        sourceId: previousRun.id,
        probabilityLow: largest.before.low,
        probabilityHigh: largest.before.high,
      },
      {
        quarter,
        label: largestChange.label,
        value: largest.after.formatted,
        sourceType: "simulation_run",
        sourceId: currentRun.id,
        probabilityLow: largest.after.low,
        probabilityHigh: largest.after.high,
      },
    );
  } else {
    const outcome = currentRun.goalOutcomes[0];
    const range = outcome ? probabilityRange(currentRun, outcome.goalId) : null;
    if (!outcome || !range) {
      throw new InsufficientQuarterDataError(`${quarter} has no goal outcome to summarize.`);
    }
    const goal = currentRun.inputs.goals.find((candidate) => candidate.id === outcome.goalId);
    evidence.push({
      quarter,
      label: `${goal?.name ?? "Goal"} probability range`,
      value: range.formatted,
      sourceType: "simulation_run",
      sourceId: currentRun.id,
      probabilityLow: range.low,
      probabilityHigh: range.high,
    });
  }
  if (previousEvents[0]) {
    evidence.push({
      quarter: previous,
      label: "Copilot activity",
      value: `${previousEvents.length} events`,
      sourceType: "copilot_event",
      sourceId: previousEvents[0].id,
      probabilityLow: null,
      probabilityHigh: null,
    });
  }
  if (currentEvents[0]) {
    evidence.push({
      quarter,
      label: "Copilot activity",
      value: `${currentEvents.length} events`,
      sourceType: "copilot_event",
      sourceId: currentEvents[0].id,
      probabilityLow: null,
      probabilityHigh: null,
    });
  }
  if (previousRecommendations[0]) {
    evidence.push({
      quarter: previous,
      label: "Advisor recommendations",
      value: `${previousRecommendations.length} recommendations`,
      sourceType: "recommendation",
      sourceId: previousRecommendations[0].id,
      probabilityLow: null,
      probabilityHigh: null,
    });
  }
  if (currentRecommendations[0]) {
    evidence.push({
      quarter,
      label: "Advisor recommendations",
      value: `${currentRecommendations.length} recommendations`,
      sourceType: "recommendation",
      sourceId: currentRecommendations[0].id,
      probabilityLow: null,
      probabilityHigh: null,
    });
  }

  const allocation = new Map<string, number>();
  let assetsCents = 0;
  let liabilitiesCents = 0;
  for (const account of currentRun.inputs.snapshot.accounts) {
    if (isLiability(account.type)) {
      liabilitiesCents += account.balanceCents;
      continue;
    }
    assetsCents += account.balanceCents;
    const category = ACCOUNT_CATEGORY[account.type];
    const label = ACCOUNT_CATEGORY_LABEL[category];
    allocation.set(label, (allocation.get(label) ?? 0) + account.balanceCents);
  }
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Linked users only see their bank's transactions here (packages/data/src/linked-banks.ts).
  const transactions = await deps.ledger.listTransactions(userId, 5_000);
  const monthlyBreakdown = monthlyCashFlow(transactions, monthKeysOf(quarter)).map((month) => ({
    month: `${monthNames[Number(month.monthKey.slice(5, 7)) - 1]} ${month.monthKey.slice(0, 4)}`,
    ...month,
  }));
  // On bank data, the quarter's figures are what actually happened. On the demo profile they are
  // the simulation's stored assumptions, as before.
  const bankFlow = dataSource === "bank" ? averageCashFlow(monthlyBreakdown) : null;
  const previousBankFlow =
    dataSource === "bank" ? averageCashFlow(monthlyCashFlow(transactions, monthKeysOf(previous))) : null;
  const assumed = {
    monthlyIncomeCents: currentRun.inputs.snapshot.monthlyIncomeCents,
    monthlySavingsCents:
      currentRun.inputs.snapshot.monthlySavingsCents + (currentRun.inputs.whatIf?.monthlySavingsDeltaCents ?? 0),
    monthlySpendingCents: Math.max(0, currentRun.inputs.snapshot.monthlySpendingCents),
  };

  const visuals = {
    dataSource,
    outlookAsOf,
    summary: {
      netWorthCents: assetsCents - liabilitiesCents,
      ...(bankFlow
        ? {
            monthlyIncomeCents: bankFlow.incomeCents,
            monthlySavingsCents: bankFlow.savingsCents,
            monthlySpendingCents: bankFlow.spendingCents,
          }
        : assumed),
    },
    accountAllocation: [...allocation.entries()]
      .map(([label, balanceCents]) => ({ label, balanceCents }))
      .sort((left, right) => right.balanceCents - left.balanceCents),
    spendingTrend:
      dataSource === "bank"
        ? [
            ...(previousBankFlow ? [{ quarter: previous, monthlySpendingCents: previousBankFlow.spendingCents }] : []),
            { quarter, monthlySpendingCents: bankFlow?.spendingCents ?? 0 },
          ]
        : [
            ...(previousRun ? [{
              quarter: previous,
              monthlySpendingCents: Math.max(0, previousRun.inputs.snapshot.monthlySpendingCents),
            }] : []),
            { quarter, monthlySpendingCents: assumed.monthlySpendingCents },
          ],
    monthlyBreakdown,
    goalComparisons: comparisons.map(({ goalId, goalName, before, after }) => ({
      goalId,
      goalName,
      previousLow: before.low,
      previousHigh: before.high,
      currentLow: after.low,
      currentHigh: after.high,
    })),
    goalPathways: currentRun.goalOutcomes.flatMap((outcome) => {
      const goal = currentRun.inputs.goals.find((candidate) => candidate.id === outcome.goalId);
      if (!goal) return [];
      const status =
        outcome.probabilityLow >= 0.6
          ? ("on_track" as const)
          : outcome.probabilityHigh >= 0.4
            ? ("watch" as const)
            : ("needs_attention" as const);
      return [
        {
          goalId: goal.id,
          goalName: goal.name,
          targetCents: goal.targetCents,
          targetDate: goal.targetDate,
          probabilityLow: outcome.probabilityLow,
          probabilityHigh: outcome.probabilityHigh,
          medianCompletionDate: outcome.medianCompletionDate,
          status,
          points: outcome.fan.map((point) => ({
            date: point.date,
            p10Cents: point.p10Cents,
            p50Cents: point.p50Cents,
            p90Cents: point.p90Cents,
          })),
        },
      ];
    }),
    suggestions: currentRun.goalOutcomes.flatMap<ReportVisuals["suggestions"][number]>((outcome) => {
      const goal = currentRun.inputs.goals.find((candidate) => candidate.id === outcome.goalId);
      if (!goal) return [];
      if (outcome.probabilityLow >= 0.6) {
        return [{
          category: "maintain" as const,
          goalId: goal.id,
          title: goal.name,
          detail: `Keep monitoring ${goal.name} and preserve the assumptions behind its current plan.`,
        }];
      }
      if (outcome.probabilityHigh >= 0.4) {
        return [{
          category: "review" as const,
          goalId: goal.id,
          title: goal.name,
          detail: `Review the savings amount and target-date flexibility for ${goal.name}.`,
        }];
      }
      return [{
        category: "explore" as const,
        goalId: goal.id,
        title: goal.name,
        detail: `Explore a higher savings scenario or a later target date for ${goal.name}.`,
      }];
    }),
  };

  return {
    quarter,
    previousQuarter: previousRun ? previous : null,
    periodStart: currentWindow.start,
    periodEnd: currentWindow.endInclusive,
    evidence,
    largestChange,
    visuals,
    activity: {
      currentCopilotEvents: currentEvents.length,
      previousCopilotEvents: previousEvents.length,
      currentRecommendations: currentRecommendations.length,
      previousRecommendations: previousRecommendations.length,
    },
    sourceIds: {
      simulationRunIds: [...previousRuns, ...currentRuns].map((run) => run.id),
      copilotEventIds: [...previousEvents, ...currentEvents].map((event) => event.id),
      recommendationIds: [...previousRecommendations, ...currentRecommendations].map(
        (recommendation) => recommendation.id,
      ),
    },
  };
}
