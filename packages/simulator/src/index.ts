import type {
  FanPoint,
  Goal,
  GoalImpact,
  GoalOutcome,
  LifeEvent,
  SimulationInputs,
  SimulationResult,
} from "@finvantage/contracts";

/*
 * Seeded Monte Carlo engine.
 *
 * Each path steps month by month from `snapshot.asOf`. Every month it:
 *   1. Samples this month's savings: base savings, plus saved raises, minus spending swings,
 *      minus an occasional income disruption, plus any recurring life events.
 *   2. Pays down any cash shortfall first (one-time purchases and unlinked one-time events
 *      drain cash, which must be rebuilt before goals see new money).
 *   3. Funds goals jointly from that one pool, in priority order: each goal first gets what it
 *      needs per month to land on its date, and anything left over speeds up goals in order.
 *   4. Grows goal balances with a sampled market return.
 *
 * Probability range: each path also draws an "assumption level" that shifts its average market
 * return and raise rate. The low end of a goal's range is its success rate among the most
 * pessimistic third of paths; the high end is the success rate among the most optimistic third.
 * See docs/DECISIONS.md.
 *
 * Every draw comes from a seeded PRNG, and each month consumes the same number of draws no
 * matter the inputs. So two runs with the same seed share their randomness, and the difference
 * between a baseline and a what-if is caused by the what-if alone.
 */

export const DEFAULT_PATHS = 5_000;
export const DEFAULT_SEED = 42;

/** Past this horizon a goal counts as not reached, rather than reporting a meaningless date. */
const MAX_MONTHS = 360;
/** Extra months simulated past the latest target date, so late completions get a date. */
const HORIZON_PAST_TARGET = 120;
/** Points per fan chart, from today to the goal's target date. */
const FAN_POINTS = 24;

/** Named assumptions. The PRD requires that every number can be explained. */
export const ASSUMPTIONS = {
  /** Goals due within this many months are held in cash; later ones are invested. */
  cashHorizonMonths: 36,
  cashAnnualReturn: 0.04,
  cashAnnualVolatility: 0.01,
  investedAnnualReturn: 0.06,
  investedAnnualVolatility: 0.12,
  /** How far one standard deviation of the assumption level shifts the invested return. */
  returnAssumptionSpread: 0.015,
  meanAnnualRaise: 0.03,
  raiseAssumptionSpread: 0.01,
  raiseVolatility: 0.02,
  /** Share of each raise that goes to savings rather than lifestyle. */
  raiseSavedShare: 0.5,
  /** Monthly spending swing, as a share of monthly spending (one standard deviation). */
  spendingVolatility: 0.05,
  /** Chance per month that an income disruption (job loss, unpaid leave) starts. */
  disruptionMonthlyChance: 0.0025,
  disruptionMonths: 3,
  /** Share of income lost during a disruption. */
  disruptionIncomeLoss: 0.6,
} as const;

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

// ---------- Dates ----------

function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** Adds a fractional number of months, landing on a specific day. */
function addFractionalMonths(iso: string, months: number): string {
  const whole = Math.floor(months);
  const start = new Date(`${addMonths(iso, whole)}T00:00:00Z`);
  const next = new Date(`${addMonths(iso, whole + 1)}T00:00:00Z`);
  const ms = start.getTime() + (next.getTime() - start.getTime()) * (months - whole);
  return new Date(ms).toISOString().slice(0, 10);
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}

const DAYS_PER_MONTH = 365.25 / 12;

/** Month difference with day precision, rounded to one decimal. */
function fractionalMonthsBetween(fromIso: string, toIso: string): number {
  const days = (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000;
  return Math.round((days / DAYS_PER_MONTH) * 10) / 10;
}

// ---------- Randomness ----------

/** mulberry32: small, fast, seedable. Never Math.random(). */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function makeNormal(rng: () => number): () => number {
  return () => {
    const u = Math.max(rng(), 1e-12);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

// ---------- Event schedule ----------

interface Schedule {
  /** Recurring change to monthly savings, indexed by month (1-based). */
  recurring: Float64Array;
  /** One-time cash changes not tied to a goal, indexed by month. Negative costs money. */
  cashOneTime: Float64Array;
  /** One-time changes to a specific goal's balance: goal index -> month -> cents. */
  goalOneTime: Map<number, Float64Array>;
}

function buildSchedule(
  inputs: SimulationInputs,
  goals: Goal[],
  horizon: number,
): Schedule {
  const { snapshot, lifeEvents, whatIf } = inputs;
  const recurring = new Float64Array(horizon + 1);
  const cashOneTime = new Float64Array(horizon + 1);
  const goalOneTime = new Map<number, Float64Array>();
  const shifts = new Map((whatIf?.eventShifts ?? []).map((s) => [s.lifeEventId, s.shiftMonths]));

  // The slider purchase happens now.
  cashOneTime[0] = (cashOneTime[0] ?? 0) - (whatIf?.purchaseAmountCents ?? 0);

  const place = (event: LifeEvent) => {
    const month = Math.max(0, monthsBetween(snapshot.asOf, event.date) + (shifts.get(event.id) ?? 0));
    if (month > horizon) return;
    if (event.recurrence === "recurring") {
      const end = event.durationMonths === null ? horizon : Math.min(horizon, month + event.durationMonths - 1);
      for (let m = Math.max(1, month); m <= end; m++) recurring[m] = (recurring[m] ?? 0) + event.dollarImpactCents;
      return;
    }
    const goalIndex = event.linkedGoalId ? goals.findIndex((g) => g.id === event.linkedGoalId) : -1;
    if (goalIndex >= 0) {
      let row = goalOneTime.get(goalIndex);
      if (!row) {
        row = new Float64Array(horizon + 1);
        goalOneTime.set(goalIndex, row);
      }
      row[month] = (row[month] ?? 0) + event.dollarImpactCents;
    } else {
      cashOneTime[month] = (cashOneTime[month] ?? 0) + event.dollarImpactCents;
    }
  };
  lifeEvents.forEach(place);

  return { recurring, cashOneTime, goalOneTime };
}

// ---------- Engine ----------

function percentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return (sorted[lo] ?? 0) + ((sorted[hi] ?? 0) - (sorted[lo] ?? 0)) * (pos - lo);
}

export function simulate(inputs: SimulationInputs, options: SimulateOptions = {}): SimulationResult {
  const { snapshot } = inputs;
  const seed = options.seed ?? DEFAULT_SEED;
  const paths = Math.max(3, Math.floor(options.paths ?? DEFAULT_PATHS));
  const A = ASSUMPTIONS;

  const goals = [...inputs.goals].sort((a, b) => a.priorityRank - b.priorityRank);
  const n = goals.length;
  if (n === 0) return { paths, seed, goalOutcomes: [] };

  const targetMonth = goals.map((g) => Math.max(1, monthsBetween(snapshot.asOf, g.targetDate)));
  const horizon = Math.min(MAX_MONTHS, Math.max(...targetMonth) + HORIZON_PAST_TARGET);
  const invested = targetMonth.map((t) => t > A.cashHorizonMonths);
  const schedule = buildSchedule(inputs, goals, horizon);

  // Fan sample months per goal, from 0 to the target month.
  const fanMonths = targetMonth.map((t) => {
    const step = Math.max(1, Math.round(t / FAN_POINTS));
    const months: number[] = [];
    for (let m = 0; m <= t; m += step) months.push(m);
    if (months[months.length - 1] !== t) months.push(t);
    return months;
  });
  const fanIndex = fanMonths.map((months) => {
    const map = new Int32Array(horizon + 1).fill(-1);
    months.forEach((m, i) => (map[m] = i));
    return map;
  });
  const fanValues = fanMonths.map((months) => months.map(() => new Float64Array(paths)));

  const completion = goals.map(() => new Float64Array(paths));
  const assumption = new Float64Array(paths);

  const baseSavings = snapshot.monthlySavingsCents + (inputs.whatIf?.monthlySavingsDeltaCents ?? 0);
  const income = snapshot.monthlyIncomeCents;
  const spending = snapshot.monthlySpendingCents;

  const rng = makeRng(seed);
  const normal = makeNormal(rng);
  const balance = new Float64Array(n);
  const done = new Uint8Array(n);

  for (let p = 0; p < paths; p++) {
    const level = normal();
    assumption[p] = level;
    const investedMonthlyMean = (A.investedAnnualReturn + level * A.returnAssumptionSpread) / 12;
    const investedMonthlyVol = A.investedAnnualVolatility / Math.sqrt(12);
    const cashMonthlyMean = A.cashAnnualReturn / 12;
    const cashMonthlyVol = A.cashAnnualVolatility / Math.sqrt(12);
    const raiseMean = A.meanAnnualRaise + level * A.raiseAssumptionSpread;

    let incomeFactor = 1;
    let shortfall = 0;
    let disruptionLeft = 0;

    for (let g = 0; g < n; g++) {
      balance[g] = goals[g]!.currentCents;
      done[g] = balance[g]! >= goals[g]!.targetCents ? 1 : 0;
      completion[g]![p] = done[g] ? 0 : Infinity;
    }

    // Month 0: today's balances and anything that happens right now.
    shortfall -= schedule.cashOneTime[0] ?? 0;
    for (const [g, row] of schedule.goalOneTime) balance[g] = balance[g]! + (row[0] ?? 0);
    for (let g = 0; g < n; g++) {
      if (balance[g]! < 0) {
        shortfall -= balance[g]!;
        balance[g] = 0;
      }
      const fi = fanIndex[g]![0]!;
      if (fi >= 0) fanValues[g]![fi]![p] = balance[g]!;
    }

    for (let m = 1; m <= horizon; m++) {
      // Fixed number of draws per month keeps runs with the same seed aligned.
      const marketZ = normal();
      const spendZ = normal();
      const raiseZ = normal();
      const disruptionRoll = rng();

      if (m % 12 === 0) incomeFactor *= 1 + raiseMean + raiseZ * A.raiseVolatility;
      if (disruptionLeft === 0 && disruptionRoll < A.disruptionMonthlyChance) {
        disruptionLeft = A.disruptionMonths;
      }

      let pool =
        baseSavings +
        income * (incomeFactor - 1) * A.raiseSavedShare -
        spendZ * spending * A.spendingVolatility +
        (schedule.recurring[m] ?? 0) +
        (schedule.cashOneTime[m] ?? 0);
      if (disruptionLeft > 0) {
        pool -= income * incomeFactor * A.disruptionIncomeLoss;
        disruptionLeft--;
      }

      // Cash shortfalls are rebuilt before goals see new money. Negative months add to it.
      if (pool < 0) {
        shortfall -= pool;
        pool = 0;
      } else if (shortfall > 0) {
        const repay = Math.min(pool, shortfall);
        shortfall -= repay;
        pool -= repay;
      }

      // Market growth on what is already saved.
      const cashReturn = cashMonthlyMean + marketZ * cashMonthlyVol;
      const investedReturn = investedMonthlyMean + marketZ * investedMonthlyVol;
      const previous = balance.slice();
      for (let g = 0; g < n; g++) {
        if (done[g]) continue;
        balance[g] = Math.max(0, balance[g]! * (1 + (invested[g] ? investedReturn : cashReturn)));
      }

      // One-time events tied to a goal.
      for (const [g, row] of schedule.goalOneTime) {
        const change = row[m] ?? 0;
        if (change === 0) continue;
        balance[g] = balance[g]! + change;
        if (balance[g]! < 0) {
          shortfall -= balance[g]!;
          balance[g] = 0;
        }
      }

      // Joint funding: what each goal needs to stay on schedule, in priority order...
      for (let g = 0; g < n && pool > 0; g++) {
        if (done[g]) continue;
        const remaining = goals[g]!.targetCents - balance[g]!;
        const monthsLeft = Math.max(1, targetMonth[g]! - m + 1);
        const give = Math.min(pool, Math.max(0, remaining / monthsLeft));
        balance[g] = balance[g]! + give;
        pool -= give;
      }
      // ...then the rest speeds up goals, still in priority order.
      for (let g = 0; g < n && pool > 0; g++) {
        if (done[g]) continue;
        const give = Math.min(pool, Math.max(0, goals[g]!.targetCents - balance[g]!));
        balance[g] = balance[g]! + give;
        pool -= give;
      }

      for (let g = 0; g < n; g++) {
        const goal = goals[g]!;
        if (!done[g] && balance[g]! >= goal.targetCents) {
          done[g] = 1;
          // Interpolate within the month for day-level completion dates.
          const before = previous[g]!;
          const gained = balance[g]! - before;
          const fraction = gained > 0 ? (goal.targetCents - before) / gained : 1;
          completion[g]![p] = m - 1 + Math.min(1, Math.max(0, fraction));
          balance[g] = goal.targetCents;
        }
        const fi = fanIndex[g]![m]!;
        if (fi >= 0) fanValues[g]![fi]![p] = balance[g]!;
      }
    }
  }

  // Assumption terciles for the probability range.
  const order = Array.from({ length: paths }, (_, i) => i).sort((a, b) => assumption[a]! - assumption[b]!);
  const third = Math.max(1, Math.floor(paths / 3));
  const pessimistic = order.slice(0, third);
  const optimistic = order.slice(paths - third);

  const outcomeById = new Map<string, GoalOutcome>();
  goals.forEach((goal, g) => {
    const t = targetMonth[g]!;
    const times = completion[g]!;
    const successRate = (ids: number[]) => ids.filter((i) => times[i]! <= t).length / ids.length;
    const a = successRate(pessimistic);
    const b = successRate(optimistic);

    const sortedTimes = Float64Array.from(times).sort();
    const median = percentile(sortedTimes, 0.5);

    const fan: FanPoint[] = fanMonths[g]!.map((month, i) => {
      const sorted = fanValues[g]![i]!.slice().sort();
      return {
        date: addMonths(snapshot.asOf, month),
        p10Cents: Math.round(percentile(sorted, 0.1)),
        p25Cents: Math.round(percentile(sorted, 0.25)),
        p50Cents: Math.round(percentile(sorted, 0.5)),
        p75Cents: Math.round(percentile(sorted, 0.75)),
        p90Cents: Math.round(percentile(sorted, 0.9)),
      };
    });

    outcomeById.set(goal.id, {
      goalId: goal.id,
      probabilityLow: Math.min(a, b),
      probabilityHigh: Math.max(a, b),
      medianCompletionDate: Number.isFinite(median) ? addFractionalMonths(snapshot.asOf, median) : null,
      fan,
    });
  });

  // Keep the caller's goal order.
  const goalOutcomes = inputs.goals.flatMap((g) => {
    const outcome = outcomeById.get(g.id);
    return outcome ? [outcome] : [];
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
        ? fractionalMonthsBetween(a.medianCompletionDate, b.medianCompletionDate)
        : null;
    return [
      {
        goalId: goal.id,
        goalName: goal.name,
        probabilityLowDelta: b.probabilityLow - a.probabilityLow,
        probabilityHighDelta: b.probabilityHigh - a.probabilityHigh,
        probabilityLowAfter: b.probabilityLow,
        probabilityHighAfter: b.probabilityHigh,
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
