import { z } from "zod";
import { Cents, IsoDate } from "./common";

/**
 * What to total over a date range. "spent" is money out minus transfers and money moved to
 * savings or investing; "saved" is the money moved to savings or investing; "income" is money in
 * under Income. The same rules as the monthly summary, so a total here matches the pages.
 */
export const PeriodKind = z.enum(["spent", "income", "saved"]);
export type PeriodKind = z.infer<typeof PeriodKind>;

export const PeriodQuery = z.object({
  /** First day, inclusive. */
  from: IsoDate,
  /** Last day, inclusive. */
  to: IsoDate,
  kind: PeriodKind.default("spent"),
  /** Part of a category's name, such as "food" or "dining". Matches the category and its subcategories. */
  category: z.string().trim().min(1).max(60).optional(),
  /** Part of a merchant's name. */
  merchant: z.string().trim().min(1).max(80).optional(),
});
export type PeriodQuery = z.input<typeof PeriodQuery>;

export const PeriodSummary = z.object({
  from: IsoDate,
  to: IsoDate,
  kind: PeriodKind,
  /** Always positive: how much was spent, earned or saved. */
  totalCents: Cents,
  count: z.number().int().nonnegative(),
  /** The categories the `category` text matched, by name. Empty when no category was asked for. */
  matchedCategories: z.array(z.string()),
  /** Every month from `from` to `to`, oldest first, zeros included. */
  byMonth: z.array(z.object({ month: z.string(), totalCents: Cents })),
  /** The biggest categories in the range, at most six. */
  byCategory: z.array(z.object({ categoryId: z.string(), label: z.string(), totalCents: Cents, count: z.number().int().positive() })),
  /** The biggest merchants in the range, at most six. */
  byMerchant: z.array(z.object({ merchant: z.string(), totalCents: Cents, count: z.number().int().positive() })),
  /** The largest transactions in the range, at most 25, biggest first. */
  transactions: z.array(z.object({ date: IsoDate, merchant: z.string(), amountCents: Cents, label: z.string() })),
  /** More transactions matched than `transactions` holds. */
  truncated: z.boolean(),
});
export type PeriodSummary = z.infer<typeof PeriodSummary>;
