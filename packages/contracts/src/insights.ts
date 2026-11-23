import { z } from "zod";
import { Cents, Id, IsoDate, Rate } from "./common";

const MonthKey = z.string().regex(/^\d{4}-\d{2}$/);

/**
 * How long cash would last, and how much of income is being kept. Both are plain arithmetic on the
 * user's own accounts and transactions, done in `math-core`.
 */
export const OverviewInsights = z.object({
  runway: z.object({
    /** Checking and savings: money available now. */
    liquidCents: Cents,
    /** The average spent over the last three full months, as the demo's definition of spending. Zero with no history. */
    averageMonthlySpendCents: Cents,
    /** Liquid cash divided by that average, in months. Null with no spending history. */
    months: z.number().nullable(),
  }),
  savingsRate: z.object({
    month: MonthKey,
    savedCents: Cents,
    incomeCents: Cents,
    /** Saved as a share of income this month (0.2 is 20%). Null when no income has arrived yet. */
    rate: Rate.nullable(),
    /** The last six months, oldest first. Null where there was no income. */
    trend: z.array(z.object({ month: MonthKey, rate: Rate.nullable() })),
  }),
});
export type OverviewInsights = z.infer<typeof OverviewInsights>;

/** One credit card, with the figures a person needs to decide which to pay. */
export const CreditCardRow = z.object({
  id: Id,
  name: z.string(),
  institution: z.string(),
  mask: z.string().nullable(),
  balanceCents: Cents,
  limitCents: Cents.nullable(),
  /** Balance as a share of the limit (0.3 is 30%). Null without a limit. */
  utilization: Rate.nullable(),
  annualRate: Rate.nullable(),
  /** What the balance costs each month at its rate: balance times rate over twelve, rounded. Zero at 0% or with no rate. */
  monthlyInterestCents: Cents,
  minimumPaymentCents: Cents.nullable(),
  nextPaymentDueOn: IsoDate.nullable(),
  /** When a 0% rate ends, if this card has one. */
  promoRateEndsOn: IsoDate.nullable(),
  /** Days from today to the due date. Negative once it has passed. Null with no due date. */
  daysUntilDue: z.number().int().nullable(),
  /**
   * For a card with a 0% rate still running: the days left, and what to pay each month to clear the
   * balance by then (the balance over the months left, rounded up). Null with no promo or once it has ended.
   */
  promoClear: z.object({ daysLeft: z.number().int().positive(), monthlyToClearCents: Cents }).nullable(),
});
export type CreditCardRow = z.infer<typeof CreditCardRow>;

export const CreditCardsOverview = z.object({
  /** The date the figures are as of: the app's "today". */
  asOf: IsoDate,
  cards: z.array(CreditCardRow),
  totals: z.object({
    balanceCents: Cents,
    limitCents: Cents,
    /** Across every card that has a limit. Null when none does. */
    utilization: Rate.nullable(),
    monthlyInterestCents: Cents,
  }),
  /** How many of each kind of credit the user has, for the "mix" factor. */
  mix: z.array(z.object({ label: z.string(), count: z.number().int().positive() })),
});
export type CreditCardsOverview = z.infer<typeof CreditCardsOverview>;

/** The quarter, half and three-quarter marks of a goal, and which are behind it. */
export const GoalMilestones = z.object({
  goalId: Id,
  name: z.string(),
  targetCents: Cents,
  currentCents: Cents,
  /** Saved over target, held between 0 and 1. */
  progress: z.number(),
  milestones: z.array(z.object({ share: z.number(), cents: Cents, reached: z.boolean() })),
  /** The next mark not yet reached, and what is left to get there. Null once all are reached. */
  next: z.object({ share: z.number(), remainingCents: Cents }).nullable(),
});
export type GoalMilestones = z.infer<typeof GoalMilestones>;
