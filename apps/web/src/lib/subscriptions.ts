import { formatUsd, type Subscription, type SubscriptionFlag } from "@finvantage/contracts";

/*
 * Words and ordering for the Subscriptions page. Every figure arrives from the API; this only
 * formats them and decides what to show first. Nothing here computes a financial number.
 */

export const CADENCE_LABEL: Record<Subscription["cadence"], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  semi_monthly: "Twice a Month",
  monthly: "Monthly",
  yearly: "Yearly",
  unknown: "Recurring",
};

export const FLAG_LABEL: Record<SubscriptionFlag["type"], string> = {
  price_up: "Price Went Up",
  possible_duplicate: "Possible Duplicate",
  started_recently: "Started Recently",
  still_charging: "Still Charging",
  annual_coming: "Annual Charge Coming",
};

export type FlagTone = "warning" | "info" | "critical";

export const FLAG_TONE: Record<SubscriptionFlag["type"], FlagTone> = {
  price_up: "warning",
  possible_duplicate: "info",
  started_recently: "info",
  still_charging: "critical",
  annual_coming: "warning",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `2026-10-03` as `Oct 3`, read from the text so a time zone cannot move the day. */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${Number(day)}` : iso;
}

/** One sentence saying why a charge is flagged, using only figures the API sent. */
export function flagDetail(flag: SubscriptionFlag, subscription: Pick<Subscription, "amountCents" | "nextDate">): string {
  const cost = formatUsd(Math.abs(subscription.amountCents));
  switch (flag.type) {
    case "price_up":
      return flag.previousCents !== null && flag.changedOn
        ? `Was ${formatUsd(flag.previousCents)}, now ${cost} since ${shortDate(flag.changedOn)}.`
        : `The price went up to ${cost}.`;
    case "possible_duplicate":
      return flag.group ? `You pay for more than one ${flag.group} service.` : "You may pay for the same thing twice.";
    case "started_recently":
      return "The first charge was in the last two months.";
    case "still_charging":
      return flag.changedOn ? `Charged again on ${shortDate(flag.changedOn)} after you cancelled.` : "Charged again after you cancelled.";
    case "annual_coming":
      return `Renews ${shortDate(subscription.nextDate)} for ${cost}.`;
  }
}

export type SubscriptionSort = "cost" | "next" | "name";

export const SORT_LABEL: Record<SubscriptionSort, string> = { cost: "Cost", next: "Next Charge", name: "Name" };

/** A new array in the order asked for. A charge with no known monthly cost goes last when sorting by cost. */
export function sortSubscriptions<T extends Pick<Subscription, "merchant" | "monthlyCents" | "nextDate">>(items: readonly T[], sort: SubscriptionSort): T[] {
  const byName = (a: T, b: T) => a.merchant.localeCompare(b.merchant);
  return [...items].sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "next") return a.nextDate.localeCompare(b.nextDate) || byName(a, b);
    if (a.monthlyCents === b.monthlyCents) return byName(a, b);
    if (a.monthlyCents === null) return 1;
    if (b.monthlyCents === null) return -1;
    return b.monthlyCents - a.monthlyCents;
  });
}

/** The ones with something to look at, most costly first. */
export function needsLook<T extends Pick<Subscription, "flags" | "merchant" | "monthlyCents" | "nextDate">>(items: readonly T[]): T[] {
  return sortSubscriptions(items.filter((item) => item.flags.length > 0), "cost");
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Charges due from `today` up to `days` days ahead, soonest first. */
export function upcomingWithin<T extends Pick<Subscription, "merchant" | "monthlyCents" | "nextDate">>(items: readonly T[], today: string, days: number): T[] {
  const end = addDays(today, days);
  return sortSubscriptions(items.filter((item) => item.nextDate >= today && item.nextDate <= end), "next");
}
