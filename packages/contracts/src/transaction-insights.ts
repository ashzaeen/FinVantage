import { z } from "zod";
import { Cents, Id, IsoDate } from "./common";

const MonthKey = z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-11.");

/** Which transactions to total. The page sends the ids of the rows it is showing, so the totals always match. */
export const TransactionSummaryRequest = z.object({ ids: z.array(Id).max(2000) });
export type TransactionSummaryRequest = z.infer<typeof TransactionSummaryRequest>;

/** Money in and out for a set of transactions, and the last six months of it. Raw ledger sums: not the "spent" figure. */
export const TransactionSummary = z.object({
  count: z.number().int().nonnegative(),
  inCents: Cents,
  outCents: Cents,
  /** In minus out. */
  netCents: Cents,
  /** Six months ending with the current one, oldest first. */
  byMonth: z.array(z.object({ month: MonthKey, inCents: Cents, outCents: Cents })),
});
export type TransactionSummary = z.infer<typeof TransactionSummary>;

/** One merchant's spending in the month. */
export const MerchantSpend = z.object({
  merchant: z.string(),
  totalCents: Cents,
  visits: z.number().int().positive(),
  /** Share of the month's spending: 0.2 means 20%. */
  share: z.number(),
});
export type MerchantSpend = z.infer<typeof MerchantSpend>;

/**
 * How a month's spending falls across days, weekdays and merchants. "Spending" is the same as
 * `SpendingSummary.spentCents`: money out, minus transfers and savings.
 */
export const SpendingPatterns = z.object({
  month: MonthKey,
  /** The date the figures run to: today for the current month, else the month's last day. */
  through: IsoDate,
  spentCents: Cents,
  /** Money out by ISO date, for days with any. Days with none are left out. */
  dailyCents: z.record(IsoDate, Cents),
  /** Days with nothing spent, up to `through`. */
  noSpendDays: z.number().int().nonnegative(),
  /** Days in a row, ending at `through`, with nothing spent. */
  currentNoSpendStreak: z.number().int().nonnegative(),
  longestNoSpendStreak: z.number().int().nonnegative(),
  /** Average spent on each kind of day over the last 90 days, from Sunday (0) to Saturday (6). */
  weekday: z.array(z.object({ day: z.number().int().min(0).max(6), averageCents: Cents })),
  weekdayAverageCents: Cents,
  weekendAverageCents: Cents,
  /** The five merchants with the most spending, biggest first. */
  topMerchants: z.array(MerchantSpend),
  /** Share of the month's spending that went to those five. */
  topMerchantsShare: z.number(),
});
export type SpendingPatterns = z.infer<typeof SpendingPatterns>;

/** Move many transactions to one category at once. */
export const BulkRecategorize = z.object({
  ids: z.array(Id).min(1).max(200),
  /** Null clears the category. */
  categoryId: z.string().min(1).nullable(),
});
export type BulkRecategorize = z.infer<typeof BulkRecategorize>;
export const BulkRecategorized = z.object({ updated: z.number().int().nonnegative() });
export type BulkRecategorized = z.infer<typeof BulkRecategorized>;

/**
 * Split one transaction into two to five parts. The parts must add up to the original amount, all
 * on the same side of zero, so the ledger total never changes. The first part keeps the original
 * row; the others are new rows with the same date, merchant and account.
 */
export const SplitTransaction = z.object({
  parts: z
    .array(z.object({ amountCents: Cents, categoryId: z.string().min(1).nullable() }))
    .min(2)
    .max(5),
});
export type SplitTransaction = z.infer<typeof SplitTransaction>;
