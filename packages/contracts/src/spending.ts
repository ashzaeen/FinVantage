import { z } from "zod";
import { Cents, Id, IsoDate } from "./common";

export const Budget = z.object({
  category: z.string(),
  limitCents: Cents,
  spentCents: Cents,
});
export type Budget = z.infer<typeof Budget>;

export const RecurringCharge = z.object({
  merchant: z.string(),
  amountCents: Cents,
  cadence: z.enum(["weekly", "monthly", "yearly"]),
  nextDate: IsoDate,
  accountId: Id,
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
