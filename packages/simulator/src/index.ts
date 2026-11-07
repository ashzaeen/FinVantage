import type {
  FanPoint,
  GoalImpact,
  GoalOutcome,
  SimulationInputs,
  SimulationResult,
} from "@finvantage/contracts";

export const DEFAULT_PATHS = 5_000;
export const DEFAULT_SEED = 42;

/** Past this horizon a goal counts as not reached, rather than reporting a meaningless date. */
const MAX_MONTHS = 480;

export interface SimulateOptions {
  seed?: number;
  paths?: number;
}

export interface HypotheticalPurchase {
  /** One-time cost. */
  amountCents: number;
  /** Ongoing cost, for rent or a car payment. */
  monthlyCents: number;
}

function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * STUB(simulator): closed-form placeholder with no randomness. It keeps the real signature and
 * output shape, responds to sliders and life events, and widens the fan over time, so the
 * dashboard and Copilot can be built against it. Replace the body with the Monte Carlo engine.
 * See AGENTS.md in this package for the requirements the real engine must meet.
 */
export function simulate(inputs: SimulationInputs, options: SimulateOptions = {}): SimulationResult {
  const { snapshot, goals, lifeEvents, whatIf } = inputs;
  const seed = options.seed ?? DEFAULT_SEED;
  const paths = options.paths ?? DEFAULT_PATHS;

  let available = snapshot.monthlySavingsCents + (whatIf?.monthlySavingsDeltaCents ?? 0);
  let oneTime = whatIf?.purchaseAmountCents ?? 0;
  for (const event of lifeEvents) {
    if (event.recurrence === "recurring") available += event.dollarImpactCents;
    else oneTime -= event.dollarImpactCents;
  }

  const goalOutcomes: GoalOutcome[] = [...goals]
    .sort((a, b) => a.priorityRank - b.priorityRank)
    .map((goal) => {
      const months = Math.max(1, monthsBetween(snapshot.asOf, goal.targetDate));
      const contribution = Math.max(0, available);
      const start = Math.max(0, goal.currentCents - oneTime);
      const projected = start + contribution * months;
      const center = clamp01(projected / goal.targetCents - 0.15);

      // Goals compete: a higher-priority goal consumes dollars before the next one sees them.
      const needed = Math.max(0, (goal.targetCents - start) / months);
      const used = Math.min(contribution, needed);
      available -= used;
      oneTime = Math.max(0, oneTime - goal.currentCents);

      const fan: FanPoint[] = [];
      for (let m = 0; m <= months; m += Math.max(1, Math.round(months / 24))) {
        const median = Math.round(start + used * m);
        const spread = Math.round(median * 0.012 * m);
        fan.push({
          date: addMonths(snapshot.asOf, m),
          p10Cents: Math.max(0, median - 2 * spread),
          p25Cents: Math.max(0, median - spread),
          p50Cents: median,
          p75Cents: median + spread,
          p90Cents: median + 2 * spread,
        });
      }

      const monthsNeeded = used > 0 ? Math.ceil((goal.targetCents - start) / used) : null;
      const monthsToTarget = monthsNeeded !== null && monthsNeeded <= MAX_MONTHS ? monthsNeeded : null;
      return {
        goalId: goal.id,
        probabilityLow: clamp01(center - 0.1),
        probabilityHigh: clamp01(center + 0.1),
        medianCompletionDate:
          monthsToTarget === null ? null : addMonths(snapshot.asOf, Math.max(0, monthsToTarget)),
        fan,
      };
    });

  return { paths, seed, goalOutcomes };
}

/** Per-goal change between two results. Used for run diffs and Copilot impact. */
export function diffOutcomes(
  goals: SimulationInputs["goals"],
  before: SimulationResult,
  after: SimulationResult,
): GoalImpact[] {
  return goals.flatMap((goal) => {
    const a = before.goalOutcomes.find((o) => o.goalId === goal.id);
    const b = after.goalOutcomes.find((o) => o.goalId === goal.id);
    if (!a || !b) return [];
    const delayMonths =
      a.medianCompletionDate && b.medianCompletionDate
        ? monthsBetween(a.medianCompletionDate, b.medianCompletionDate)
        : null;
    return [
      {
        goalId: goal.id,
        goalName: goal.name,
        probabilityLowDelta: b.probabilityLow - a.probabilityLow,
        probabilityHighDelta: b.probabilityHigh - a.probabilityHigh,
        delayMonths,
      },
    ];
  });
}

/** The callable API for the Copilot: what does this purchase do to each goal? */
export function evaluatePurchase(
  inputs: SimulationInputs,
  purchase: HypotheticalPurchase,
  options: SimulateOptions = {},
): GoalImpact[] {
  const baseline = simulate(inputs, options);
  const withPurchase = simulate(
    {
      ...inputs,
      whatIf: {
        monthlySavingsDeltaCents:
          (inputs.whatIf?.monthlySavingsDeltaCents ?? 0) - purchase.monthlyCents,
        purchaseAmountCents: (inputs.whatIf?.purchaseAmountCents ?? 0) + purchase.amountCents,
        eventShifts: inputs.whatIf?.eventShifts ?? [],
      },
    },
    options,
  );
  return diffOutcomes(inputs.goals, baseline, withPurchase);
}
