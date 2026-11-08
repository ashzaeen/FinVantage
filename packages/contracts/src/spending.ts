import { z } from "zod";
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
