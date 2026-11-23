import { z } from "zod";
import { AssetClass } from "./investments";
import { Cents, Id, IsoDate, Probability, Rate } from "./common";
import { CashForecast, RetirementFan } from "./simulation";

const MonthKey = z.string().regex(/^\d{4}-\d{2}$/);

/* ─── Safe to spend ──────────────────────────────────────────────────────── */

/**
 * What is left to spend this month without missing a bill or a savings target. Plain arithmetic:
 * `safeCents = checkingCents + incomeStillDueCents - billsStillDueCents - savingsStillNeededCents`.
 * It can be negative, which means the month is already spoken for.
 */
export const SafeToSpend = z.object({
  asOf: IsoDate,
  /** The last day of the month the figure covers. */
  periodEnd: IsoDate,
  safeCents: Cents,
  parts: z.object({
    /** Checking accounts today. */
    checkingCents: Cents,
    /** Expected monthly income not yet received this month, from the profile. Zero once it has all arrived. */
    incomeStillDueCents: Cents,
    /** Subscriptions, bills and card payments due between today and the end of the month. */
    billsStillDueCents: Cents,
    /** What is left of this month's savings target (the split's savings share of expected income, minus what is already saved). */
    savingsStillNeededCents: Cents,
  }),
});
export type SafeToSpend = z.infer<typeof SafeToSpend>;

/* ─── Needs attention ────────────────────────────────────────────────────── */

export const AttentionKind = z.enum([
  "card_past_due",
  "still_charging",
  "budget_over",
  "bill_due_soon",
  "promo_ending",
  "budget_at_risk",
  "price_rise",
  "possible_duplicate",
]);
export type AttentionKind = z.infer<typeof AttentionKind>;

/** One thing worth a look today. The sentence is built from the figures, in code. */
export const AttentionItem = z.object({
  id: z.string(),
  kind: AttentionKind,
  /** "action" is something to do soon; "heads_up" is something to know about. */
  severity: z.enum(["action", "heads_up"]),
  message: z.string(),
  /** The page that deals with it. */
  href: z.string(),
});
export type AttentionItem = z.infer<typeof AttentionItem>;

export const AttentionFeed = z.object({ asOf: IsoDate, items: z.array(AttentionItem) });
export type AttentionFeed = z.infer<typeof AttentionFeed>;

/* ─── Goal funding ───────────────────────────────────────────────────────── */

/** What each goal needs a month to reach its target on its date, at a steady pace. */
export const GoalFundingRow = z.object({
  goalId: Id,
  name: z.string(),
  remainingCents: Cents,
  /** Whole months from today to the target date, at least 1. */
  monthsLeft: z.number().int().positive(),
  /** Remaining over months left, rounded up. Zero for a goal already reached. */
  neededPerMonthCents: Cents,
  /** True when the target date has already passed and the goal is not reached. */
  pastDue: z.boolean(),
  /** The simulator's median finish date, when it has one. */
  medianCompletionDate: IsoDate.nullable(),
});
export type GoalFundingRow = z.infer<typeof GoalFundingRow>;

export const GoalFunding = z.object({
  asOf: IsoDate,
  goals: z.array(GoalFundingRow),
  /** All goals' monthly needs added up. */
  neededPerMonthCents: Cents,
  /** What the profile says is set aside each month. */
  monthlySavingsCents: Cents,
});
export type GoalFunding = z.infer<typeof GoalFunding>;

/* ─── Spending pace ──────────────────────────────────────────────────────── */

/** Money out, added up day by day, against last month and the budgets. */
export const SpendingPace = z.object({
  month: MonthKey,
  through: IsoDate,
  /** Cumulative spend at the end of each day of the month so far. */
  thisMonthCents: z.array(Cents),
  /** Cumulative spend at the end of each day of last month. */
  lastMonthCents: z.array(Cents),
  /** Last month's cumulative spend on the same day number as `through`. */
  lastMonthSameDayCents: Cents,
  /** This month so far minus last month on the same day. Negative is under last month's pace. */
  aheadByCents: Cents,
  /** What this month ends at if it keeps its pace so far. */
  projectedCents: Cents,
  /** All category budgets added up, or null when there are none. */
  budgetCents: Cents.nullable(),
});
export type SpendingPace = z.infer<typeof SpendingPace>;

/* ─── Budget suggestions ─────────────────────────────────────────────────── */

export const BudgetSuggestion = z.object({
  category: z.string(),
  /** The middle of the last three full months, rounded up to the next $5. */
  suggestedLimitCents: Cents,
  typicalCents: Cents,
});
export type BudgetSuggestion = z.infer<typeof BudgetSuggestion>;

/* ─── Unusual charges ────────────────────────────────────────────────────── */

export const UnusualCharge = z.object({
  id: Id,
  merchant: z.string(),
  amountCents: Cents,
  /** The middle of the earlier charges at this merchant. */
  usualCents: Cents,
  /** This charge over the usual amount (2.4 means 2.4 times). */
  ratio: z.number(),
});
export type UnusualCharge = z.infer<typeof UnusualCharge>;

/* ─── Credit: what-if and payoff ─────────────────────────────────────────── */

export const CreditWhatIfRequest = z.object({
  cardId: Id,
  paymentCents: Cents.positive(),
});
export type CreditWhatIfRequest = z.infer<typeof CreditWhatIfRequest>;

/** A utilization and the score range an estimate attaches to it. */
export const UtilizationState = z.object({
  /** This card's balance over its limit. Null without a limit. */
  cardUtilization: Rate.nullable(),
  /** Every card together. Null when no card has a limit. */
  totalUtilization: Rate.nullable(),
  scoreLow: z.number().int(),
  scoreHigh: z.number().int(),
});
export type UtilizationState = z.infer<typeof UtilizationState>;

/** `mocked: true` is a literal: the score is an estimate from a stated rule, never a real FICO score. */
export const CreditWhatIf = z.object({
  mocked: z.literal(true),
  cardId: Id,
  cardName: z.string(),
  /** The payment actually applied: held to the balance. */
  paymentCents: Cents,
  before: UtilizationState,
  after: UtilizationState,
});
export type CreditWhatIf = z.infer<typeof CreditWhatIf>;

export const PayoffStrategy = z.enum(["avalanche", "snowball"]);
export type PayoffStrategy = z.infer<typeof PayoffStrategy>;

export const PayoffPlan = z.object({
  strategy: PayoffStrategy,
  /** Months until every debt is paid. Null if it would take longer than 30 years. */
  months: z.number().int().positive().nullable(),
  payoffDate: IsoDate.nullable(),
  totalInterestCents: Cents,
  /** Total owed at the start of each month of the plan, then zero: a line to draw. Month 0 first. */
  balanceByMonth: z.array(Cents),
  /** The order the debts are cleared in. */
  order: z.array(z.object({ id: Id, name: z.string(), clearedInMonth: z.number().int().positive().nullable() })),
});
export type PayoffPlan = z.infer<typeof PayoffPlan>;

export const DebtPayoff = z.object({
  asOf: IsoDate,
  /** Extra money put toward debt each month on top of the minimums. */
  extraPerMonthCents: Cents,
  debts: z.array(z.object({ id: Id, name: z.string(), balanceCents: Cents, annualRate: Rate, minimumPaymentCents: Cents })),
  /** The two plans side by side. Empty when the user has no debts this covers. */
  plans: z.array(PayoffPlan),
  /** Interest the avalanche saves over the snowball. Zero when they tie or there are no debts. */
  avalancheSavesCents: Cents,
  /** Months sooner the avalanche order finishes than the snowball order. Zero when they tie or either never finishes. */
  avalancheFinishesSoonerMonths: z.number().int().nonnegative(),
});
export type DebtPayoff = z.infer<typeof DebtPayoff>;

/* ─── Health score ───────────────────────────────────────────────────────── */

export const HealthPart = z.object({
  key: z.enum(["savings_rate", "debt_to_income", "utilization", "runway"]),
  label: z.string(),
  /** The figure behind the score, as words: "41% saved", "34%", "3.8 months". */
  valueText: z.string(),
  /** 0 to 100. */
  score: z.number().int().min(0).max(100),
  /** Share of the total, adding to 1. */
  weight: z.number(),
  /** Null when there is no data for this part. Then it counts for nothing and the rest are re-weighted. */
  hasData: z.boolean(),
});
export type HealthPart = z.infer<typeof HealthPart>;

export const HealthScore = z.object({
  asOf: IsoDate,
  score: z.number().int().min(0).max(100),
  label: z.enum(["Strong", "Good", "Fair", "Needs Work"]),
  parts: z.array(HealthPart),
});
export type HealthScore = z.infer<typeof HealthScore>;

/* ─── Allocation drift ───────────────────────────────────────────────────── */

/** The mix the user wants, as shares of the whole. Shares add to 1 (within a hair). */
export const TargetAllocation = z
  .record(AssetClass, z.number().min(0).max(1))
  .refine((t) => Math.abs(Object.values(t).reduce((a, b) => a + b, 0) - 1) < 0.0001, { message: "Targets must add up to 100%." });
export type TargetAllocation = z.infer<typeof TargetAllocation>;

export const AllocationDriftRow = z.object({
  assetClass: AssetClass,
  actual: Rate,
  target: Rate,
  /** Actual minus target. Positive means more than wanted. */
  drift: z.number(),
  /** Dollars to move to reach the target: positive to add, negative to trim. */
  moveCents: Cents,
  /** Outside the allowed band. */
  outside: z.boolean(),
});
export type AllocationDriftRow = z.infer<typeof AllocationDriftRow>;

export const AllocationDrift = z.object({
  mocked: z.literal(true),
  /** False until the user sets targets: the rows then use a balanced starting mix, shown as a suggestion. */
  targetsSet: z.boolean(),
  targets: z.record(AssetClass, z.number()),
  totalCents: Cents,
  /** How far from the target counts as drifted, as a share (0.05 is five points). */
  band: z.number(),
  rows: z.array(AllocationDriftRow),
});
export type AllocationDrift = z.infer<typeof AllocationDrift>;

/* ─── Income variability ─────────────────────────────────────────────────── */

/** How much an income source moves month to month. */
export const IncomeVariability = z.object({
  categoryId: z.string(),
  /** Per month, over the months that had any. */
  lowCents: Cents,
  highCents: Cents,
  typicalCents: Cents,
  months: z.number().int().nonnegative(),
});
export type IncomeVariability = z.infer<typeof IncomeVariability>;

/* ─── Copilot impact ─────────────────────────────────────────────────────── */

export const CopilotImpact = z.object({
  checked: z.number().int().nonnegative(),
  /** Checks where a goal would slip or the cash cushion would fall below target. */
  flagged: z.number().int().nonnegative(),
  flaggedCents: Cents,
  /** Months by which goals would have slipped, summed over the flagged checks, using each check's worst-hit goal. */
  goalMonthsAtStake: z.number().int().nonnegative(),
  /** The last eight weeks, oldest first, each starting on a Monday: how many checks and how many flagged. */
  weeks: z.array(z.object({ weekStart: IsoDate, checked: z.number().int().nonnegative(), flagged: z.number().int().nonnegative() })),
});
export type CopilotImpact = z.infer<typeof CopilotImpact>;

/* ─── Money calendar ─────────────────────────────────────────────────────── */

export const CalendarEventKind = z.enum(["payday", "bill", "card_due"]);

/** Thirty days of paydays, bills and card payments, with checking projected day by day. */
export const MoneyCalendar = z.object({
  asOf: IsoDate,
  days: z.number().int().positive(),
  startingCents: Cents,
  events: z.array(
    z.object({
      date: IsoDate,
      kind: CalendarEventKind,
      label: z.string(),
      /** Positive. Null for a card with no stated minimum, which is shown but not counted. */
      amountCents: Cents.nullable(),
    }),
  ),
  /** Checking at the end of each day, starting with today. */
  balanceByDay: z.array(Cents),
  lowestCents: Cents,
  lowestDate: IsoDate,
});
export type MoneyCalendar = z.infer<typeof MoneyCalendar>;

/* ─── Stress test ────────────────────────────────────────────────────────── */

/** Two switches: income lower by a share, and rent higher by a share. Both can be zero. */
export const StressRequest = z.object({
  incomeDropShare: z.number().min(0).max(0.5).default(0),
  rentRiseShare: z.number().min(0).max(0.5).default(0),
});
export type StressRequest = z.infer<typeof StressRequest>;

const OddsRange = z.object({ low: Probability, high: Probability, medianDate: IsoDate.nullable() });

/**
 * The same goals and life events with less income and/or higher rent. The change is taken straight
 * out of monthly savings: `monthlyChangeCents = -(income x drop + rent x rise)`. Plain arithmetic,
 * stated on the page. Odds are ranges.
 */
export const StressResult = z.object({
  incomeDropShare: z.number(),
  rentRiseShare: z.number(),
  /** What each month's savings change by. Zero or negative. */
  monthlyChangeCents: Cents,
  monthlyIncomeCents: Cents,
  /** The usual monthly rent, from the last three full months of housing spending. */
  monthlyRentCents: Cents,
  goals: z.array(z.object({ goalId: Id, name: z.string(), before: OddsRange, after: OddsRange })),
  baselineCash: CashForecast,
  stressedCash: CashForecast,
});
export type StressResult = z.infer<typeof StressResult>;

/* ─── Retirement ─────────────────────────────────────────────────────────── */

export const RetirementRequest = z.object({
  /** Years from now to retirement. */
  years: z.number().int().min(1).max(60),
  monthlyContributionCents: Cents.nonnegative().max(100_000_000),
});
export type RetirementRequest = z.infer<typeof RetirementRequest>;

/** `mocked: true` is a literal: the fan is a stated simplification, never a forecast of real accounts. */
export const RetirementProjection = RetirementFan.extend({
  mocked: z.literal(true),
  /** Today's balance in retirement accounts. */
  startingFromAccounts: z.boolean(),
});
export type RetirementProjection = z.infer<typeof RetirementProjection>;

/* ─── Where savings go, and a suggested rebalance ────────────────────────── */

export const GoalAllocationRow = z.object({
  goalId: Id,
  name: z.string(),
  priorityRank: z.number().int().positive(),
  flexibility: z.enum(["flexible", "non_negotiable"]),
  /** What this goal needs each month to land on its date (from goal funding). */
  neededCents: Cents,
  /** What it gets from the monthly savings, funding goals in priority order. */
  allocatedCents: Cents,
  /** Needed minus allocated. Zero when fully funded. */
  shortCents: Cents,
});
export type GoalAllocationRow = z.infer<typeof GoalAllocationRow>;

/** What one goal gets or loses if the suggested order is used. */
export const RebalanceEffect = z.object({
  goalId: Id,
  name: z.string(),
  beforeCents: Cents,
  afterCents: Cents,
  /** Months later than its date at the new amount. Null when it would get nothing, so it pauses. Zero when not late. */
  delayMonths: z.number().int().nonnegative().nullable(),
});
export type RebalanceEffect = z.infer<typeof RebalanceEffect>;

/** A different priority order that funds a fixed-date goal in full, at the cost of a flexible one. A suggestion only. */
export const GoalRebalance = z.object({
  receiverId: Id,
  receiverName: z.string(),
  donorId: Id,
  donorName: z.string(),
  /** Dollars a month the receiver gains. */
  movedCents: Cents,
  /** The new priority rank for each goal whose rank changes. */
  newRanks: z.array(z.object({ goalId: Id, priorityRank: z.number().int().positive() })),
  effects: z.array(RebalanceEffect),
});
export type GoalRebalance = z.infer<typeof GoalRebalance>;

/**
 * Monthly savings handed to goals in priority order, each getting what it needs to land on its
 * date until the money runs out. The same first step the simulator takes. Plain arithmetic.
 */
export const GoalAllocation = z.object({
  asOf: IsoDate,
  monthlySavingsCents: Cents,
  rows: z.array(GoalAllocationRow),
  /** Savings left after every goal has what it needs. */
  unallocatedCents: Cents,
  rebalance: GoalRebalance.nullable(),
});
export type GoalAllocation = z.infer<typeof GoalAllocation>;
