import { z } from "zod";
import { Transaction } from "./account";
import { Cents, Id, IsoDate } from "./common";

/** A budget envelope the user set: a monthly limit for one spending category. */
export const BudgetLimit = z.object({
  category: z.string().min(1),
  monthlyLimitCents: Cents.positive(),
});
export type BudgetLimit = z.infer<typeof BudgetLimit>;

/**
 * This month's spending at the most specific category each transaction carries. Add the rows
 * under an id (`shopping` includes `shopping.superstores.c4f9`) for that category's total.
 */
export const SpendingBreakdownRow = z.object({ categoryId: z.string(), spentCents: Cents });
export type SpendingBreakdownRow = z.infer<typeof SpendingBreakdownRow>;

/** A category's limit next to what was spent this month, and where the month is heading. */
export const Budget = z.object({
  /** A category or subcategory id. */
  category: z.string(),
  limitCents: Cents,
  spentCents: Cents,
  /** Negative once over the limit. */
  remainingCents: Cents,
  /** What the month ends at if spending keeps its pace so far. */
  projectedCents: Cents,
  /** Over the limit already, heading over it, or within it. */
  status: z.enum(["on_track", "at_risk", "over"]),
  /** The average of the last three full months, as a starting point. Null with no history. */
  suggestedLimitCents: Cents.nullable(),
});
export type Budget = z.infer<typeof Budget>;

export const RecurringCharge = z.object({
  merchant: z.string(),
  amountCents: Cents,
  cadence: z.enum(["weekly", "biweekly", "semi_monthly", "monthly", "yearly", "unknown"]),
  nextDate: IsoDate,
  accountId: Id,
  /** A category id, when known. */
  category: z.string().nullable().default(null),
  /** "bank" when it comes from the bank's recurring streams or bill due dates, "estimate" otherwise. */
  source: z.enum(["bank", "estimate"]).default("estimate"),
});
export type RecurringCharge = z.infer<typeof RecurringCharge>;

export const SpendingSummary = z.object({
  month: z.string(),
  categories: z.array(
    z.object({
      category: z.string(),
      spentCents: Cents,
      changeVsPriorMonthCents: Cents,
    }),
  ),
  monthlyTrend: z.array(z.object({ month: z.string(), incomeCents: Cents, spendingCents: Cents })).default([]),
});
export type SpendingSummary = z.infer<typeof SpendingSummary>;

/** `mocked: true` is a literal so the UI can never forget the "labeled as mocked" rule. */
export const Portfolio = z.object({
  mocked: z.literal(true),
  holdings: z.array(z.object({ symbol: z.string(), name: z.string(), valueCents: Cents })),
  allocation: z.array(z.object({ assetClass: z.string(), weight: z.number() })),
  benchmark: z.array(z.object({ date: IsoDate, portfolio: z.number(), benchmark: z.number() })),
});
export type Portfolio = z.infer<typeof Portfolio>;

export const CreditScore = z.object({
  mocked: z.literal(true),
  score: z.number().int(),
  history: z.array(z.object({ date: IsoDate, score: z.number().int() })),
});
export type CreditScore = z.infer<typeof CreditScore>;

/** Where income came from, over the last six months. */
export const IncomeSource = z.object({
  merchant: z.string(),
  totalCents: Cents,
  deposits: z.number().int(),
  lastDate: IsoDate,
  /** The bank flagged these deposits as repeating, like a paycheck. */
  isRecurring: z.boolean(),
});
export type IncomeSource = z.infer<typeof IncomeSource>;

/** Income by category this month. Deposits with no subcategory count as Other Income. */
export const IncomeCategoryRow = z.object({
  categoryId: z.string(),
  totalCents: Cents,
  deposits: z.number().int(),
  /** Share of this month's income: 0.4 means 40%. */
  share: z.number(),
});
export type IncomeCategoryRow = z.infer<typeof IncomeCategoryRow>;

/** Money in: this month, the recent past, where it comes from, and what is left after spending. */
export const IncomeSummary = z.object({
  month: z.string(),
  /** What the user's profile expects each month. Zero when none is set. */
  expectedMonthlyCents: Cents,
  thisMonthCents: Cents,
  lastMonthCents: Cents,
  /** The average over the last three full months. */
  averageMonthlyCents: Cents,
  yearToDateCents: Cents,
  /** Share of the last six months' income not spent: 0.2 means 20%. Null with no income. */
  savingsRate: z.number().nullable(),
  /** "steady" when full months are within 15% of their average, else "varies". */
  stability: z.enum(["steady", "varies", "not_enough_data"]),
  trend: z.array(z.object({ month: z.string(), incomeCents: Cents, spendingCents: Cents })),
  /** Monthly debt payments against monthly income, both from the profile. Ratio is null with no income. */
  debtToIncome: z.object({ monthlyDebtCents: Cents, monthlyIncomeCents: Cents, ratio: z.number().nullable() }),
  categories: z.array(IncomeCategoryRow),
  sources: z.array(IncomeSource),
  recent: z.array(Transaction),
});
export type IncomeSummary = z.infer<typeof IncomeSummary>;
