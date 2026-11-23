import {
  ACCOUNT_CATEGORY_LABEL,
  isLiability,
  type Account,
  type CreditCardRow,
  type CreditCardsOverview,
  type Goal,
  type GoalMilestones,
  type NetWorth,
  type OverviewInsights,
} from "@finvantage/contracts";

/** Months of past spending the runway averages over. */
export const RUNWAY_MONTHS = 3;
/** The marks on a goal's ladder, as shares of its target. */
export const GOAL_MILESTONE_SHARES = [0.25, 0.5, 0.75] as const;
/** Paychecks looked back over to find the payday pattern. */
export const PAYDAY_LOOKBACK_DAYS = 120;

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Days in a month, for turning the days left on a 0% rate into months of payments. */
const DAYS_PER_MONTH = 30;

/** What to pay each month to clear a 0% balance before the rate ends. Null with no promo, or once it has ended. */
function promoClearOf(account: Account, today: string): CreditCardRow["promoClear"] {
  if (!account.promoRateEndsOn) return null;
  const daysLeft = daysBetween(today, account.promoRateEndsOn);
  if (daysLeft <= 0) return null;
  const months = Math.max(1, Math.ceil(daysLeft / DAYS_PER_MONTH));
  return { daysLeft, monthlyToClearCents: Math.ceil(account.balanceCents / months) };
}

interface TrendPoint {
  month: string;
  incomeCents: number;
  spendingCents: number;
  savedCents: number;
}

/**
 * How long cash would last at the recent pace of spending, and how much of income is being kept.
 * `trend` is six months oldest first and its last entry is the current month; the runway averages
 * the full months before it.
 */
export function overviewInsights(liquidCents: number, trend: readonly TrendPoint[]): OverviewInsights {
  const current = trend[trend.length - 1];
  const fullMonths = trend.slice(0, -1).slice(-RUNWAY_MONTHS);
  const averageMonthlySpendCents = fullMonths.length ? Math.round(fullMonths.reduce((sum, p) => sum + p.spendingCents, 0) / fullMonths.length) : 0;
  const rateOf = (p: TrendPoint) => (p.incomeCents > 0 ? p.savedCents / p.incomeCents : null);
  return {
    runway: {
      liquidCents,
      averageMonthlySpendCents,
      months: averageMonthlySpendCents > 0 ? liquidCents / averageMonthlySpendCents : null,
    },
    savingsRate: {
      month: current?.month ?? "",
      savedCents: current?.savedCents ?? 0,
      incomeCents: current?.incomeCents ?? 0,
      rate: current ? rateOf(current) : null,
      trend: trend.map((p) => ({ month: p.month, rate: rateOf(p) })),
    },
  };
}

/** Checking and savings: money you can spend today. */
export function liquidCashCents(accounts: readonly Account[]): number {
  return accounts.filter((a) => a.type === "checking" || a.type === "savings").reduce((sum, a) => sum + a.balanceCents, 0);
}

/**
 * How reachable the assets are: cash now, a brokerage account (a few days to sell and settle), and
 * what is locked up in CDs and retirement accounts.
 */
export function liquidityOf(accounts: readonly Account[]): NetWorth["liquidity"] {
  const sum = (types: readonly Account["type"][]) => accounts.filter((a) => types.includes(a.type)).reduce((total, a) => total + a.balanceCents, 0);
  return { cashCents: sum(["checking", "savings"]), sellableCents: sum(["brokerage"]), lockedCents: sum(["cd", "ira"]) };
}

/** Each credit card with its utilization and what its balance costs a month, plus totals and the mix of credit. */
export function creditCardsOverview(accounts: readonly Account[], today: string): CreditCardsOverview {
  const cards: CreditCardRow[] = accounts
    .filter((a) => a.type === "credit_card")
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      mask: a.mask,
      balanceCents: a.balanceCents,
      limitCents: a.creditLimitCents && a.creditLimitCents > 0 ? a.creditLimitCents : null,
      utilization: a.creditLimitCents && a.creditLimitCents > 0 ? a.balanceCents / a.creditLimitCents : null,
      annualRate: a.annualRate,
      monthlyInterestCents: a.annualRate ? Math.round((a.balanceCents * a.annualRate) / 12) : 0,
      minimumPaymentCents: a.minimumPaymentCents,
      nextPaymentDueOn: a.nextPaymentDueOn,
      promoRateEndsOn: a.promoRateEndsOn,
      daysUntilDue: a.nextPaymentDueOn ? daysBetween(today, a.nextPaymentDueOn) : null,
      promoClear: promoClearOf(a, today),
    }))
    .sort((a, b) => b.balanceCents - a.balanceCents);
  const withLimit = cards.filter((c) => c.limitCents !== null);
  const limitCents = withLimit.reduce((sum, c) => sum + c.limitCents!, 0);
  const limitedBalance = withLimit.reduce((sum, c) => sum + c.balanceCents, 0);

  const credit = accounts.filter((a) => isLiability(a.type));
  const counts = new Map<string, number>();
  for (const a of credit) {
    const label = a.type === "loan" ? (a.loanKind === "auto" ? "Auto loan" : "Personal loan") : a.type === "credit_card" ? "Credit card" : ACCOUNT_CATEGORY_LABEL.mortgages.replace(/s$/, "");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return {
    asOf: today,
    cards,
    totals: {
      balanceCents: cards.reduce((sum, c) => sum + c.balanceCents, 0),
      limitCents,
      utilization: limitCents > 0 ? limitedBalance / limitCents : null,
      monthlyInterestCents: cards.reduce((sum, c) => sum + c.monthlyInterestCents, 0),
    },
    mix: [...counts].map(([label, count]) => ({ label, count })),
  };
}

/** The quarter marks of each goal, which are behind it, and what is left to the next one. */
export function goalMilestones(goals: readonly Goal[]): GoalMilestones[] {
  return goals.map((goal) => {
    const progress = Math.min(1, ratio(goal.currentCents, goal.targetCents));
    const milestones = GOAL_MILESTONE_SHARES.map((share) => {
      const cents = Math.round(goal.targetCents * share);
      return { share, cents, reached: goal.currentCents >= cents };
    });
    const next = milestones.find((m) => !m.reached);
    return {
      goalId: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      currentCents: goal.currentCents,
      progress,
      milestones,
      next: next ? { share: next.share, remainingCents: next.cents - goal.currentCents } : null,
    };
  });
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

/**
 * The next likely payday and the usual size of a paycheck, from recent paychecks. The pattern is
 * the days of the month paychecks landed on (the 1st and 15th, say); the next payday is the next
 * such day after today. Null with no paychecks in the last 120 days.
 */
/** Every likely payday in the next `days` days (not today), and the usual paycheck size. Same pattern as `nextPayday`. */
export function paydaysAhead(paychecks: readonly { date: string; amountCents: number }[], today: string, days: number): { dates: string[]; expectedCents: number } {
  const since = addDays(today, -PAYDAY_LOOKBACK_DAYS);
  const recent = paychecks.filter((p) => p.date >= since && p.date <= today && p.amountCents > 0);
  if (recent.length === 0) return { dates: [], expectedCents: 0 };
  const patternDays = [...new Set(recent.map((p) => Number(p.date.slice(8))))].sort((a, b) => a - b);
  const dates: string[] = [];
  // A pattern day past the end of a short month lands on its last day.
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i);
    const [y, m, d] = date.split("-").map(Number) as [number, number, number];
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (patternDays.some((day) => Math.min(day, lastDay) === d)) dates.push(date);
  }
  return { dates, expectedCents: median(recent.map((p) => p.amountCents)) };
}

export function nextPayday(paychecks: readonly { date: string; amountCents: number }[], today: string): { date: string; expectedCents: number; daysAway: number } | null {
  const { dates, expectedCents } = paydaysAhead(paychecks, today, 62);
  const date = dates[0];
  return date ? { date, expectedCents, daysAway: Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) } : null;
}
