import { z } from "zod";
import { Cents, Id, IsoDate, Rate } from "./common";
import { RecurringCharge } from "./spending";

/** A subscription is a want that repeats; a bill is a necessity or a loan payment that repeats. */
export const SubscriptionKind = z.enum(["subscription", "bill"]);
export type SubscriptionKind = z.infer<typeof SubscriptionKind>;

/** What the user said about a charge. Only the user changes it. */
export const SubscriptionStatus = z.enum(["active", "keep", "cancelling", "cancelled"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const SubscriptionFlagType = z.enum([
  "price_up",
  "possible_duplicate",
  "started_recently",
  "still_charging",
  "annual_coming",
]);
export type SubscriptionFlagType = z.infer<typeof SubscriptionFlagType>;

/** Something worth a second look. The figures are computed by the API, so the page only shows them. */
export const SubscriptionFlag = z.object({
  type: SubscriptionFlagType,
  /** price_up: what each charge used to be, as a positive amount. */
  previousCents: Cents.nullable().default(null),
  /** price_up: the date of the first charge at the new price. still_charging: the charge that should not have posted. */
  changedOn: IsoDate.nullable().default(null),
  /** possible_duplicate: the group it shares with another subscription, such as "Video Streaming". */
  group: z.string().nullable().default(null),
});
export type SubscriptionFlag = z.infer<typeof SubscriptionFlag>;

/** One past charge of a subscription. Money out is negative, as on a transaction. */
export const SubscriptionCharge = z.object({ date: IsoDate, amountCents: Cents });
export type SubscriptionCharge = z.infer<typeof SubscriptionCharge>;

export const Subscription = RecurringCharge.extend({
  /** Stable across syncs: the same account and merchant always give the same id. */
  id: Id,
  kind: SubscriptionKind,
  status: SubscriptionStatus.default("active"),
  /** Positive cost per month, or null when the cadence is unknown. */
  monthlyCents: Cents.nullable(),
  /** Positive cost per year, or null when the cadence is unknown. */
  annualCents: Cents.nullable(),
  /** The most recent charge seen, or null when the ledger has none. */
  lastChargeDate: IsoDate.nullable().default(null),
  flags: z.array(SubscriptionFlag).default([]),
});
export type Subscription = z.infer<typeof Subscription>;

/** What a group of charges costs. Cancelled ones are left out. */
export const SubscriptionTotals = z.object({
  monthlyCents: Cents,
  annualCents: Cents,
  /** Active charges counted. */
  count: z.number().int(),
  /** Charges whose cadence is unknown, so they are in the count but not in the sums. */
  unknownCadenceCount: z.number().int(),
});
export type SubscriptionTotals = z.infer<typeof SubscriptionTotals>;

export const SubscriptionOverview = z.object({
  subscriptions: z.array(Subscription),
  bills: z.array(Subscription),
  cancelled: z.array(Subscription),
  subscriptionTotals: SubscriptionTotals,
  billTotals: SubscriptionTotals,
  /** Subscription spend as a share of monthly income (0.05 is 5%), or null when income is unknown. */
  shareOfIncome: Rate.nullable(),
});
export type SubscriptionOverview = z.infer<typeof SubscriptionOverview>;
