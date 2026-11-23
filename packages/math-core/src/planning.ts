import type {
  Account,
  AllocationDrift,
  AssetClass,
  AttentionItem,
  BudgetSuggestion,
  CopilotEvent,
  CopilotImpact,
  CreditWhatIf,
  DebtPayoff,
  GoalFunding,
  HealthScore,
  IncomeVariability,
  PayoffPlan,
  GoalAllocation,
  GoalAllocationRow,
  GoalRebalance,
  MoneyCalendar,
  PayoffStrategy,
  SafeToSpend,
  SpendingPace,
  UnusualCharge,
  UtilizationState,
} from "@finvantage/contracts";
import { monthsBetween } from "./dates";
import type { SpendRow } from "./patterns";

/*
 * Planning figures: what is safe to spend, what needs attention, what each goal needs, how a
 * month is paced, and the what-ifs on credit and debt. Pure and deterministic, with every
 * assumption a named constant here so the page can say what it assumed.
 */

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Linear interpolation along points sorted by x, held flat beyond both ends. */
function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/* ─── Safe to spend ──────────────────────────────────────────────────────── */

export function safeToSpend(input: {
  asOf: string;
  checkingCents: number;
  expectedIncomeCents: number;
  receivedIncomeCents: number;
  /** Everything with a due date: subscriptions, bills and card payments, as positive amounts. */
  bills: readonly { nextDate: string; cents: number }[];
  /** The savings share of the user's split (0.2 is 20%). */
  savingsShare: number;
  savedCents: number;
}): SafeToSpend {
  const periodEnd = lastDayOf(input.asOf.slice(0, 7));
  const incomeStillDueCents = Math.max(0, input.expectedIncomeCents - input.receivedIncomeCents);
  const billsStillDueCents = input.bills.filter((b) => b.nextDate >= input.asOf && b.nextDate <= periodEnd).reduce((sum, b) => sum + b.cents, 0);
  const savingsStillNeededCents = Math.max(0, Math.round(input.expectedIncomeCents * input.savingsShare) - input.savedCents);
  return {
    asOf: input.asOf,
    periodEnd,
    safeCents: input.checkingCents + incomeStillDueCents - billsStillDueCents - savingsStillNeededCents,
    parts: { checkingCents: input.checkingCents, incomeStillDueCents, billsStillDueCents, savingsStillNeededCents },
  };
}

/* ─── Needs attention ────────────────────────────────────────────────────── */

/** A bill counts as due soon within this many days. */
export const BILL_DUE_SOON_DAYS = 3;
/** A 0% rate is worth a heads-up this many days before it ends. */
export const PROMO_WARNING_DAYS = 60;
/** The feed lists this many items at most. */
export const MAX_ATTENTION_ITEMS = 5;

const KIND_ORDER: Record<AttentionItem["kind"], number> = {
  card_past_due: 0,
  still_charging: 1,
  budget_over: 2,
  bill_due_soon: 3,
  promo_ending: 4,
  budget_at_risk: 5,
  price_rise: 6,
  possible_duplicate: 7,
};

export function attentionItems(input: {
  asOf: string;
  cards: readonly { id: string; name: string; nextPaymentDueOn: string | null; daysUntilDue: number | null; promoRateEndsOn: string | null; promoDaysLeft: number | null }[];
  budgets: readonly { category: string; label: string; status: "on_track" | "at_risk" | "over"; remainingCents: number; projectedCents: number; limitCents: number }[];
  /** Subscriptions and bills still running, with when they next charge. */
  charges: readonly { id: string; merchant: string; amountCents: number; nextDate: string; kind: "subscription" | "bill"; status: string }[];
  subscriptions: readonly { id: string; merchant: string; flags: readonly { type: string; previousCents: number | null; currentCents: number | null; group: string | null }[] }[];
}): AttentionItem[] {
  const items: Array<AttentionItem & { urgency: number }> = [];

  for (const c of input.cards) {
    if (c.daysUntilDue !== null && c.daysUntilDue < 0 && c.nextPaymentDueOn) {
      items.push({ id: `card_past_due:${c.id}`, kind: "card_past_due", severity: "action", message: `${c.name} looks past due: the payment was due ${shortDate(c.nextPaymentDueOn)}.`, href: "/credit", urgency: c.daysUntilDue });
    }
    if (c.promoDaysLeft !== null && c.promoDaysLeft <= PROMO_WARNING_DAYS && c.promoRateEndsOn) {
      items.push({ id: `promo_ending:${c.id}`, kind: "promo_ending", severity: "heads_up", message: `${c.name}'s 0% rate ends ${shortDate(c.promoRateEndsOn)}, in ${c.promoDaysLeft} days.`, href: "/credit", urgency: c.promoDaysLeft });
    }
  }

  for (const s of input.subscriptions) {
    for (const f of s.flags) {
      if (f.type === "still_charging") items.push({ id: `still_charging:${s.id}`, kind: "still_charging", severity: "action", message: `${s.merchant} charged you again after you cancelled it.`, href: "/subscriptions", urgency: 0 });
      if (f.type === "price_up" && f.previousCents !== null && f.currentCents !== null) {
        items.push({ id: `price_rise:${s.id}`, kind: "price_rise", severity: "heads_up", message: `${s.merchant} went up from ${usd(f.previousCents)} to ${usd(f.currentCents)}.`, href: "/subscriptions", urgency: 0 });
      }
      if (f.type === "possible_duplicate" && f.group) {
        items.push({ id: `possible_duplicate:${s.id}`, kind: "possible_duplicate", severity: "heads_up", message: `${s.merchant} is one of more than one ${f.group} service you pay for.`, href: "/subscriptions", urgency: 0 });
      }
    }
  }

  for (const b of input.budgets) {
    if (b.status === "over") {
      items.push({ id: `budget_over:${b.category}`, kind: "budget_over", severity: "action", message: `${b.label} is ${usd(-b.remainingCents)} over its ${usd(b.limitCents)} limit this month.`, href: "/spending", urgency: b.remainingCents });
    } else if (b.status === "at_risk") {
      items.push({ id: `budget_at_risk:${b.category}`, kind: "budget_at_risk", severity: "heads_up", message: `${b.label} is on pace for ${usd(b.projectedCents)}, over its ${usd(b.limitCents)} limit.`, href: "/spending", urgency: b.remainingCents });
    }
  }

  for (const c of input.charges) {
    if (c.status === "cancelled") continue;
    const days = daysBetween(input.asOf, c.nextDate);
    if (days >= 0 && days <= BILL_DUE_SOON_DAYS) {
      const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      items.push({ id: `bill_due_soon:${c.id}`, kind: "bill_due_soon", severity: "action", message: `${c.merchant} (${usd(Math.abs(c.amountCents))}) is due ${shortDate(c.nextDate)}, ${when}.`, href: c.kind === "bill" ? "/subscriptions" : "/subscriptions", urgency: days });
    }
  }

  return items
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "action" ? -1 : 1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.urgency - b.urgency || a.id.localeCompare(b.id))
    .slice(0, MAX_ATTENTION_ITEMS)
    .map(({ urgency: _urgency, ...item }) => item);
}

/* ─── Goal funding ───────────────────────────────────────────────────────── */

export function goalFunding(input: {
  asOf: string;
  goals: readonly { id: string; name: string; targetCents: number; currentCents: number; targetDate: string }[];
  medianCompletionDates: ReadonlyMap<string, string | null>;
  monthlySavingsCents: number;
}): GoalFunding {
  const rows = input.goals.map((g) => {
    const remainingCents = Math.max(0, g.targetCents - g.currentCents);
    const away = monthsBetween(input.asOf, g.targetDate);
    const pastDue = g.targetDate <= input.asOf && remainingCents > 0;
    const monthsLeft = Math.max(1, away);
    return {
      goalId: g.id,
      name: g.name,
      remainingCents,
      monthsLeft,
      neededPerMonthCents: remainingCents === 0 ? 0 : Math.ceil(remainingCents / monthsLeft),
      pastDue,
      medianCompletionDate: input.medianCompletionDates.get(g.id) ?? null,
    };
  });
  return { asOf: input.asOf, goals: rows, neededPerMonthCents: rows.reduce((sum, r) => sum + r.neededPerMonthCents, 0), monthlySavingsCents: input.monthlySavingsCents };
}

/* ─── Spending pace ──────────────────────────────────────────────────────── */

export function spendingPace(rows: readonly SpendRow[], month: string, today: string, budgetCents: number | null): SpendingPace {
  const through = month === today.slice(0, 7) ? today : lastDayOf(month);
  const day = Number(through.slice(8, 10));
  const daysInMonth = Number(lastDayOf(month).slice(8, 10));
  const cumulative = (m: string, length: number) => {
    const perDay = Array.from({ length }, () => 0);
    // Rows dated after the last day wanted (a purchase booked ahead of today) are left out, or they would stretch the line.
    for (const r of rows) {
      const index = Number(r.date.slice(8, 10)) - 1;
      if (r.date.slice(0, 7) === m && index < length) perDay[index]! += r.cents;
    }
    let sum = 0;
    return perDay.map((c) => (sum += c));
  };
  const last = shiftMonth(month, -1);
  const thisMonthCents = cumulative(month, day);
  const lastMonthCents = cumulative(last, Number(lastDayOf(last).slice(8, 10)));
  const lastMonthSameDayCents = lastMonthCents[Math.min(day, lastMonthCents.length) - 1] ?? 0;
  const soFar = thisMonthCents[day - 1] ?? 0;
  return {
    month,
    through,
    thisMonthCents,
    lastMonthCents,
    lastMonthSameDayCents,
    aheadByCents: soFar - lastMonthSameDayCents,
    projectedCents: through === lastDayOf(month) ? soFar : Math.round((soFar / day) * daysInMonth),
    budgetCents,
  };
}

/* ─── Budget suggestions ─────────────────────────────────────────────────── */

/** Months of history the suggestion looks at. */
export const SUGGESTION_MONTHS = 3;
/** Suggestions round up to the next multiple of this, so a limit reads as a plain number. */
export const SUGGESTION_ROUND_CENTS = 500;
/** A category below this typical monthly spend is not worth a limit. */
export const SUGGESTION_MIN_CENTS = 1_000;
export const MAX_SUGGESTIONS = 6;

export function budgetSuggestions(rows: readonly { date: string; category: string; cents: number }[], budgeted: ReadonlySet<string>, today: string): BudgetSuggestion[] {
  const months = Array.from({ length: SUGGESTION_MONTHS }, (_, i) => shiftMonth(today.slice(0, 7), -(i + 1)));
  const byCategory = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    if (!months.includes(m) || budgeted.has(r.category)) continue;
    const perMonth = byCategory.get(r.category) ?? new Map<string, number>();
    perMonth.set(m, (perMonth.get(m) ?? 0) + r.cents);
    byCategory.set(r.category, perMonth);
  }
  return [...byCategory]
    .map(([category, perMonth]) => {
      const typicalCents = median(months.map((m) => perMonth.get(m) ?? 0));
      return { category, typicalCents, suggestedLimitCents: Math.ceil(typicalCents / SUGGESTION_ROUND_CENTS) * SUGGESTION_ROUND_CENTS };
    })
    .filter((s) => s.typicalCents >= SUGGESTION_MIN_CENTS)
    .sort((a, b) => b.typicalCents - a.typicalCents || a.category.localeCompare(b.category))
    .slice(0, MAX_SUGGESTIONS);
}

/* ─── Unusual charges ────────────────────────────────────────────────────── */

/** A charge is unusual at this many times what the same merchant usually charges. */
export const UNUSUAL_RATIO = 2;
/** It must also be this much more, so a $3 coffee that cost $7 is not flagged. */
export const UNUSUAL_MIN_EXCESS_CENTS = 2_000;
/** Earlier charges needed before "usual" means anything. */
export const UNUSUAL_MIN_HISTORY = 3;

export function unusualCharges(transactions: readonly { id: string; merchant: string; date: string; amountCents: number }[]): UnusualCharge[] {
  const byMerchant = new Map<string, { id: string; merchant: string; date: string; cents: number }[]>();
  for (const t of transactions) {
    if (t.amountCents >= 0) continue;
    const key = t.merchant.trim().toLowerCase();
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), { id: t.id, merchant: t.merchant, date: t.date, cents: -t.amountCents }]);
  }
  const out: UnusualCharge[] = [];
  for (const charges of byMerchant.values()) {
    charges.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    charges.forEach((c, i) => {
      const earlier = charges.slice(0, i).map((e) => e.cents);
      if (earlier.length < UNUSUAL_MIN_HISTORY) return;
      const usualCents = median(earlier);
      if (usualCents > 0 && c.cents >= usualCents * UNUSUAL_RATIO && c.cents - usualCents >= UNUSUAL_MIN_EXCESS_CENTS) {
        out.push({ id: c.id, merchant: c.merchant, amountCents: c.cents, usualCents, ratio: c.cents / usualCents });
      }
    });
  }
  return out.sort((a, b) => b.ratio - a.ratio || a.id.localeCompare(b.id));
}

/* ─── Credit what-if ─────────────────────────────────────────────────────── */

/**
 * The demo's score estimate: points lost at each utilization, from a typical scoring guideline.
 * Utilization is the share of limits used; the first column is that share, the second is the
 * points taken off. It is an estimate for a mocked score, not a real model.
 */
export const UTILIZATION_SCORE_POINTS: readonly (readonly [number, number])[] = [[0, 0], [0.1, -5], [0.3, -20], [0.5, -45], [0.75, -70], [1, -90]];
/** The score range is the estimate plus and minus this many points. */
export const SCORE_RANGE_HALF_WIDTH = 15;
export const MIN_SCORE = 300;
export const MAX_SCORE = 850;

function utilizationState(cards: readonly Account[], cardId: string, baseScore: number, baseUtilization: number | null, balances: ReadonlyMap<string, number>): UtilizationState {
  const limited = cards.filter((c) => c.creditLimitCents && c.creditLimitCents > 0);
  const limit = limited.reduce((sum, c) => sum + c.creditLimitCents!, 0);
  const balance = limited.reduce((sum, c) => sum + (balances.get(c.id) ?? c.balanceCents), 0);
  const total = limit > 0 ? balance / limit : null;
  const card = cards.find((c) => c.id === cardId)!;
  const cardBalance = balances.get(card.id) ?? card.balanceCents;
  const estimate = total === null || baseUtilization === null
    ? baseScore
    : baseScore + interpolate(UTILIZATION_SCORE_POINTS, total) - interpolate(UTILIZATION_SCORE_POINTS, baseUtilization);
  return {
    cardUtilization: card.creditLimitCents && card.creditLimitCents > 0 ? cardBalance / card.creditLimitCents : null,
    totalUtilization: total,
    scoreLow: Math.round(clamp(estimate - SCORE_RANGE_HALF_WIDTH, MIN_SCORE, MAX_SCORE)),
    scoreHigh: Math.round(clamp(estimate + SCORE_RANGE_HALF_WIDTH, MIN_SCORE, MAX_SCORE)),
  };
}

/** What paying a card down does to utilization and an estimated score range. The payment is held to the balance. */
export function creditWhatIf(accounts: readonly Account[], cardId: string, paymentCents: number, baseScore: number): CreditWhatIf | null {
  const cards = accounts.filter((a) => a.type === "credit_card");
  const card = cards.find((c) => c.id === cardId);
  if (!card) return null;
  const applied = Math.min(paymentCents, card.balanceCents);
  const limited = cards.filter((c) => c.creditLimitCents && c.creditLimitCents > 0);
  const limit = limited.reduce((sum, c) => sum + c.creditLimitCents!, 0);
  const baseUtilization = limit > 0 ? limited.reduce((sum, c) => sum + c.balanceCents, 0) / limit : null;
  const noChange = new Map<string, number>();
  const afterBalances = new Map([[card.id, card.balanceCents - applied]]);
  return {
    mocked: true,
    cardId: card.id,
    cardName: card.name,
    paymentCents: applied,
    before: utilizationState(cards, card.id, baseScore, baseUtilization, noChange),
    after: utilizationState(cards, card.id, baseScore, baseUtilization, afterBalances),
  };
}

/* ─── Debt payoff ────────────────────────────────────────────────────────── */

/** A debt with no stated minimum is assumed to need this share of its balance a month, at least this much. */
export const DEFAULT_MINIMUM_SHARE = 0.02;
export const DEFAULT_MINIMUM_FLOOR_CENTS = 2_500;
/** A plan that has not finished by then is reported as never. */
export const MAX_PAYOFF_MONTHS = 360;

export interface DebtInput {
  id: string;
  name: string;
  balanceCents: number;
  /** A decimal fraction: 0.2299 is 22.99%. */
  annualRate: number;
  minimumPaymentCents: number;
}

/** Debts as the plan sees them: balances, rates and minimums, with the minimum filled in where the bank gave none. */
export function debtsFromAccounts(accounts: readonly Account[]): DebtInput[] {
  return accounts
    .filter((a) => (a.type === "credit_card" || a.type === "loan") && a.balanceCents > 0)
    .map((a) => ({
      id: a.id,
      name: a.name,
      balanceCents: a.balanceCents,
      annualRate: a.annualRate ?? 0,
      minimumPaymentCents: Math.min(a.balanceCents, a.minimumPaymentCents ?? Math.max(DEFAULT_MINIMUM_FLOOR_CENTS, Math.round(a.balanceCents * DEFAULT_MINIMUM_SHARE))),
    }));
}

/**
 * Pay every minimum, then put what is left (extra money plus the minimums of debts already gone)
 * on one debt at a time: highest rate first (avalanche) or smallest balance first (snowball).
 * Interest accrues monthly at rate over twelve, on the balance at the start of the month.
 */
export function payoffPlan(debts: readonly DebtInput[], extraCents: number, strategy: PayoffStrategy, asOf: string): PayoffPlan {
  const order = [...debts].sort((a, b) =>
    strategy === "avalanche" ? b.annualRate - a.annualRate || a.balanceCents - b.balanceCents : a.balanceCents - b.balanceCents || b.annualRate - a.annualRate,
  );
  const balance = new Map(debts.map((d) => [d.id, d.balanceCents]));
  const cleared = new Map<string, number>();
  const budget = debts.reduce((sum, d) => sum + d.minimumPaymentCents, 0) + extraCents;
  const balanceByMonth = [debts.reduce((sum, d) => sum + d.balanceCents, 0)];
  let totalInterestCents = 0;
  let month = 0;

  while (month < MAX_PAYOFF_MONTHS && [...balance.values()].some((b) => b > 0)) {
    month += 1;
    for (const d of debts) {
      const b = balance.get(d.id)!;
      if (b <= 0) continue;
      const interest = Math.round((b * d.annualRate) / 12);
      totalInterestCents += interest;
      balance.set(d.id, b + interest);
    }
    let left = budget;
    for (const d of debts) {
      const b = balance.get(d.id)!;
      if (b <= 0) continue;
      const pay = Math.min(d.minimumPaymentCents, b, left);
      balance.set(d.id, b - pay);
      left -= pay;
    }
    for (const d of order) {
      if (left <= 0) break;
      const b = balance.get(d.id)!;
      if (b <= 0) continue;
      const pay = Math.min(b, left);
      balance.set(d.id, b - pay);
      left -= pay;
    }
    for (const d of debts) if (balance.get(d.id)! <= 0 && !cleared.has(d.id)) cleared.set(d.id, month);
    balanceByMonth.push([...balance.values()].reduce((sum, b) => sum + Math.max(0, b), 0));
  }

  const done = [...balance.values()].every((b) => b <= 0);
  const payoffDate = done && month > 0 ? addMonthsIso(asOf, month) : null;
  return {
    strategy,
    months: done && month > 0 ? month : null,
    payoffDate,
    totalInterestCents,
    balanceByMonth,
    order: order.map((d) => ({ id: d.id, name: d.name, clearedInMonth: cleared.get(d.id) ?? null })),
  };
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function debtPayoff(accounts: readonly Account[], extraCents: number, asOf: string): DebtPayoff {
  const debts = debtsFromAccounts(accounts);
  const plans = debts.length ? (["avalanche", "snowball"] as const).map((s) => payoffPlan(debts, extraCents, s, asOf)) : [];
  const [avalanche, snowball] = plans;
  return {
    asOf,
    extraPerMonthCents: extraCents,
    debts: debts.map(({ id, name, balanceCents, annualRate, minimumPaymentCents }) => ({ id, name, balanceCents, annualRate, minimumPaymentCents })),
    plans,
    avalancheSavesCents: avalanche && snowball ? Math.max(0, snowball.totalInterestCents - avalanche.totalInterestCents) : 0,
  };
}

/* ─── Health score ───────────────────────────────────────────────────────── */

/** Each part's share of the score. */
export const HEALTH_WEIGHTS = { savings_rate: 0.3, debt_to_income: 0.25, utilization: 0.2, runway: 0.25 } as const;
/** Points on each part's curve: the figure, then the score it earns. */
export const SAVINGS_RATE_POINTS: readonly (readonly [number, number])[] = [[0, 0], [0.2, 100]];
export const DEBT_TO_INCOME_POINTS: readonly (readonly [number, number])[] = [[0.15, 100], [0.36, 65], [0.43, 45], [0.6, 0]];
export const UTILIZATION_POINTS: readonly (readonly [number, number])[] = [[0, 100], [0.1, 100], [0.3, 75], [0.5, 40], [0.9, 0]];
export const RUNWAY_POINTS: readonly (readonly [number, number])[] = [[0, 0], [3, 60], [6, 100]];

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function healthScore(input: {
  asOf: string;
  /** Share of income kept, averaged over recent full months. Null with no income. */
  savingsRate: number | null;
  debtToIncome: number | null;
  utilization: number | null;
  runwayMonths: number | null;
}): HealthScore {
  const raw = [
    { key: "savings_rate" as const, label: "Savings Rate", value: input.savingsRate, points: SAVINGS_RATE_POINTS, text: (v: number) => `${pct(Math.max(0, v))} saved` },
    { key: "debt_to_income" as const, label: "Debt-to-Income", value: input.debtToIncome, points: DEBT_TO_INCOME_POINTS, text: pct },
    { key: "utilization" as const, label: "Card Utilization", value: input.utilization, points: UTILIZATION_POINTS, text: pct },
    { key: "runway" as const, label: "Cash Runway", value: input.runwayMonths, points: RUNWAY_POINTS, text: (v: number) => `${v.toFixed(1)} months` },
  ];
  const withData = raw.filter((p) => p.value !== null);
  const weightSum = withData.reduce((sum, p) => sum + HEALTH_WEIGHTS[p.key], 0);
  const parts = raw.map((p) => ({
    key: p.key,
    label: p.label,
    valueText: p.value === null ? "No data yet" : p.text(p.value),
    score: p.value === null ? 0 : Math.round(interpolate(p.points, p.value)),
    weight: p.value === null || weightSum === 0 ? 0 : HEALTH_WEIGHTS[p.key] / weightSum,
    hasData: p.value !== null,
  }));
  const score = Math.round(parts.reduce((sum, p) => sum + p.score * p.weight, 0));
  return { asOf: input.asOf, score, label: score >= 80 ? "Strong" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Work", parts };
}

/* ─── Allocation drift ───────────────────────────────────────────────────── */

/** A starting mix for someone who has not chosen one. A suggestion, not advice. */
export const BALANCED_TARGET: Record<AssetClass, number> = { us_stocks: 0.55, international: 0.15, bonds: 0.25, crypto: 0, cash: 0.05 };
/** How far from the target counts as drifted: five points. */
export const DRIFT_BAND = 0.05;
const ASSET_CLASSES: readonly AssetClass[] = ["us_stocks", "international", "bonds", "crypto", "cash"];

export function allocationDrift(allocation: readonly { assetClass: AssetClass; valueCents: number }[], targets: Record<AssetClass, number> | null): AllocationDrift {
  const totalCents = allocation.reduce((sum, s) => sum + s.valueCents, 0);
  const target = targets ?? BALANCED_TARGET;
  const rows = ASSET_CLASSES.map((assetClass) => {
    const value = allocation.find((s) => s.assetClass === assetClass)?.valueCents ?? 0;
    const actual = totalCents > 0 ? value / totalCents : 0;
    const drift = actual - target[assetClass];
    return { assetClass, actual, target: target[assetClass], drift, moveCents: Math.round((target[assetClass] - actual) * totalCents), outside: Math.abs(drift) > DRIFT_BAND };
  });
  return { mocked: true, targetsSet: targets !== null, targets: { ...target }, totalCents, band: DRIFT_BAND, rows };
}

/* ─── Income variability ─────────────────────────────────────────────────── */

/** A source is "variable" when its best and worst months differ by this much of its typical month. */
export const VARIABLE_SPREAD = 0.25;

export function incomeVariability(sourcesByMonth: readonly { month: string; categories: readonly { categoryId: string; totalCents: number }[] }[]): IncomeVariability[] {
  const byCategory = new Map<string, number[]>();
  for (const m of sourcesByMonth) for (const c of m.categories) if (c.totalCents > 0) byCategory.set(c.categoryId, [...(byCategory.get(c.categoryId) ?? []), c.totalCents]);
  return [...byCategory]
    .filter(([, totals]) => totals.length >= 2)
    .map(([categoryId, totals]) => ({ categoryId, lowCents: Math.min(...totals), highCents: Math.max(...totals), typicalCents: median(totals), months: totals.length }))
    .filter((v) => v.typicalCents > 0 && (v.highCents - v.lowCents) / v.typicalCents >= VARIABLE_SPREAD)
    .sort((a, b) => b.typicalCents - a.typicalCents);
}

/* ─── Copilot impact ─────────────────────────────────────────────────────── */

export function copilotImpact(events: readonly Pick<CopilotEvent, "extractedPriceCents" | "metrics">[]): CopilotImpact {
  let flagged = 0;
  let flaggedCents = 0;
  let goalMonthsAtStake = 0;
  for (const e of events) {
    const worstDelay = Math.max(0, ...e.metrics.goalImpacts.map((g) => g.delayMonths ?? 0));
    const belowCushion = e.metrics.liquidBufferAfterCents !== null && e.metrics.liquidBufferAfterCents < e.metrics.bufferTargetCents;
    if (worstDelay > 0 || belowCushion) {
      flagged += 1;
      flaggedCents += e.extractedPriceCents;
      goalMonthsAtStake += Math.round(worstDelay);
    }
  }
  return { checked: events.length, flagged, flaggedCents, goalMonthsAtStake };
}

/* ─── Money calendar ─────────────────────────────────────────────────────── */

/** The calendar looks this many days ahead, today included. */
export const MONEY_CALENDAR_DAYS = 30;

/**
 * Paydays, bills and card payments over the next 30 days, and what checking would hold at the end
 * of each day if all of them happen on their dates. Each charge counts once, on its next date;
 * a card counts its minimum payment, or nothing when none is stated. A projection, not a promise.
 */
export function moneyCalendar(input: {
  asOf: string;
  checkingCents: number;
  paydays: readonly string[];
  paydayCents: number;
  bills: readonly { date: string; label: string; cents: number }[];
  cardDues: readonly { date: string; label: string; cents: number | null }[];
}): MoneyCalendar {
  const last = addDays(input.asOf, MONEY_CALENDAR_DAYS - 1);
  const inWindow = (date: string) => date >= input.asOf && date <= last;
  const events: MoneyCalendar["events"] = [
    ...input.paydays.filter(inWindow).map((date) => ({ date, kind: "payday" as const, label: "Payday", amountCents: input.paydayCents })),
    ...input.bills.filter((b) => inWindow(b.date)).map((b) => ({ date: b.date, kind: "bill" as const, label: b.label, amountCents: b.cents })),
    ...input.cardDues.filter((c) => inWindow(c.date)).map((c) => ({ date: c.date, kind: "card_due" as const, label: c.label, amountCents: c.cents })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  let balance = input.checkingCents;
  const balanceByDay: number[] = [];
  let lowestCents = balance;
  let lowestDate = input.asOf;
  for (let i = 0; i < MONEY_CALENDAR_DAYS; i++) {
    const date = addDays(input.asOf, i);
    for (const e of events) {
      if (e.date !== date || e.amountCents === null) continue;
      balance += e.kind === "payday" ? e.amountCents : -e.amountCents;
    }
    balanceByDay.push(balance);
    if (balance < lowestCents) { lowestCents = balance; lowestDate = date; }
  }
  return { asOf: input.asOf, days: MONEY_CALENDAR_DAYS, startingCents: input.checkingCents, events, balanceByDay, lowestCents, lowestDate };
}

/** The stress test's one rule: income lost and rent added both come straight out of monthly savings. */
export function stressMonthlyChange(input: { monthlyIncomeCents: number; monthlyRentCents: number; incomeDropShare: number; rentRiseShare: number }): number {
  return -(Math.round(input.monthlyIncomeCents * input.incomeDropShare) + Math.round(input.monthlyRentCents * input.rentRiseShare));
}

/* ─── Where savings go ───────────────────────────────────────────────────── */

type AllocationGoal = { id: string; name: string; priorityRank: number; flexibility: "flexible" | "non_negotiable"; neededPerMonthCents: number; remainingCents: number; monthsLeft: number };

const byPriority = <T extends { priorityRank: number; name: string }>(a: T, b: T) => a.priorityRank - b.priorityRank || a.name.localeCompare(b.name);

function allocate(goals: readonly AllocationGoal[], monthlySavingsCents: number) {
  let pool = Math.max(0, monthlySavingsCents);
  const rows: GoalAllocationRow[] = [...goals].sort(byPriority).map((g) => {
    const allocatedCents = Math.min(pool, g.neededPerMonthCents);
    pool -= allocatedCents;
    return { goalId: g.id, name: g.name, priorityRank: g.priorityRank, flexibility: g.flexibility, neededCents: g.neededPerMonthCents, allocatedCents, shortCents: g.neededPerMonthCents - allocatedCents };
  });
  return { rows, unallocatedCents: pool };
}

/**
 * The monthly savings divided across goals in priority order, and, when a fixed-date goal is short
 * while a flexible goal ranked above it is fully funded, a different order that funds the fixed
 * goal. The new order is only offered when it makes that goal whole. It ignores growth and
 * interest, like goal funding, so the simulated odds can differ.
 */
export function goalAllocation(input: { asOf: string; monthlySavingsCents: number; goals: readonly AllocationGoal[] }): GoalAllocation {
  const { rows, unallocatedCents } = allocate(input.goals, input.monthlySavingsCents);
  return { asOf: input.asOf, monthlySavingsCents: input.monthlySavingsCents, rows, unallocatedCents, rebalance: rebalanceFor(input.goals, input.monthlySavingsCents, rows) };
}

function rebalanceFor(goals: readonly AllocationGoal[], savings: number, rows: GoalAllocationRow[]): GoalRebalance | null {
  const receiver = rows.find((r) => r.shortCents > 0 && r.flexibility === "non_negotiable");
  if (!receiver) return null;
  // The flexible goal just above it that is fully funded and is taking money the fixed goal needs.
  const donor = [...rows].reverse().find((r) => r.priorityRank <= receiver.priorityRank && r !== receiver && r.flexibility === "flexible" && r.allocatedCents > 0 && r.shortCents === 0);
  if (!donor) return null;
  const order = rows.map((r) => r.goalId).filter((id) => id !== receiver.goalId);
  order.splice(order.indexOf(donor.goalId), 0, receiver.goalId);
  const reranked = goals.map((g) => ({ ...g, priorityRank: order.indexOf(g.id) + 1 }));
  const after = allocate(reranked, savings).rows;
  const nowWhole = after.find((r) => r.goalId === receiver.goalId)!;
  if (nowWhole.shortCents > 0) return null;
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const effects = rows.flatMap((before) => {
    const a = after.find((r) => r.goalId === before.goalId)!;
    if (a.allocatedCents === before.allocatedCents) return [];
    const g = goalById.get(before.goalId)!;
    const delayMonths = a.allocatedCents === 0 ? null : Math.max(0, Math.ceil(g.remainingCents / a.allocatedCents) - g.monthsLeft);
    return [{ goalId: before.goalId, name: before.name, beforeCents: before.allocatedCents, afterCents: a.allocatedCents, delayMonths }];
  });
  const newRanks = reranked.filter((g) => g.priorityRank !== goalById.get(g.id)!.priorityRank).map((g) => ({ goalId: g.id, priorityRank: g.priorityRank }));
  return {
    receiverId: receiver.goalId,
    receiverName: receiver.name,
    donorId: donor.goalId,
    donorName: donor.name,
    movedCents: nowWhole.allocatedCents - receiver.allocatedCents,
    newRanks,
    effects,
  };
}
