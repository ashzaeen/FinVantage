import {
  canonicalCategoryId,
  type BillingChannel,
  categoryBucket,
  topCategoryId,
  type RecurringCharge,
  type SubscriptionCharge,
  type SubscriptionKind,
  type SubscriptionStatus,
  type SubscriptionTotals,
} from "@finvantage/contracts";

/*
 * Subscription figures. Every number on the Subscriptions page comes from here, before any LLM
 * call. Pure and deterministic: today's date and the ledger's start are passed in. Assumptions
 * are named constants so the page can explain them. Money is integer cents, and amounts returned
 * as costs are positive; a charge in a history is negative, as on a transaction.
 */

type Cadence = RecurringCharge["cadence"];

/** Charges per year for each cadence. "unknown" has none, so it has no cost. */
const CHARGES_PER_YEAR: Record<Exclude<Cadence, "unknown">, number> = {
  weekly: 52,
  biweekly: 26,
  semi_monthly: 24,
  monthly: 12,
  yearly: 1,
};

/** Days between charges, used to judge whether a cancelled charge should have stopped. */
const DAYS_BETWEEN_CHARGES: Record<Exclude<Cadence, "unknown">, number> = {
  weekly: 7,
  biweekly: 14,
  semi_monthly: 365.25 / 24,
  monthly: 365.25 / 12,
  yearly: 365.25,
};

/** A rise counts as a price increase at the larger of this many cents or this share of the old price. */
export const PRICE_RISE_MIN_CENTS = 100;
export const PRICE_RISE_MIN_SHARE = 0.02;
/** A rise is only shown while it is this recent, so an old hike does not nag for a year. */
export const PRICE_CHANGE_WINDOW_DAYS = 120;
/** The charge to compare with a year back may be this many days off. */
export const YEAR_AGO_TOLERANCE_DAYS = 20;
/** A first charge this recent counts as a recent start, if the ledger reaches back far enough to tell. */
export const STARTED_RECENTLY_DAYS = 60;
/** The ledger must start this many days before a first charge, or the charge may only look new. */
export const LEDGER_LOOKBACK_DAYS = 45;
/** A yearly charge due within this many days is worth a warning. */
export const ANNUAL_WARNING_DAYS = 30;
/** After a cancellation, one more charge may still post within a cadence, up to this many days. */
export const MAX_CANCEL_GRACE_DAYS = 35;

const MS_PER_DAY = 86_400_000;

function daysApart(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / MS_PER_DAY);
}

function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/* ─── Cost ─────────────────────────────────────────────────────────────── */

/** What one charge costs per year, exactly, or null when the cadence is unknown. */
export function annualCostCents(amountCents: number, cadence: Cadence): number | null {
  if (cadence === "unknown") return null;
  return Math.abs(amountCents) * CHARGES_PER_YEAR[cadence];
}

/** What one charge costs per month, rounded once to the cent, or null when the cadence is unknown. */
export function monthlyCostCents(amountCents: number, cadence: Cadence): number | null {
  const annual = annualCostCents(amountCents, cadence);
  return annual === null ? null : Math.round(annual / 12);
}

export interface CostItem {
  monthlyCents: number | null;
  annualCents: number | null;
  status: SubscriptionStatus;
}

/**
 * The cost of a group of charges. Cancelled ones are left out. A charge with an unknown cadence
 * is counted but adds nothing, so the sums never include a guess. The yearly sum adds exact
 * yearly costs; it is not twelve times the monthly sum.
 */
export function sumCosts(items: readonly CostItem[]): SubscriptionTotals {
  const counted = items.filter((i) => i.status !== "cancelled");
  return {
    monthlyCents: counted.reduce((sum, i) => sum + (i.monthlyCents ?? 0), 0),
    annualCents: counted.reduce((sum, i) => sum + (i.annualCents ?? 0), 0),
    count: counted.length,
    unknownCadenceCount: counted.filter((i) => i.monthlyCents === null).length,
  };
}

/** Monthly cost as a share of monthly income (0.05 is 5%), or null when income is not known. */
export function shareOfIncome(monthlyCents: number, monthlyIncomeCents: number | null): number | null {
  return monthlyIncomeCents !== null && monthlyIncomeCents > 0 ? monthlyCents / monthlyIncomeCents : null;
}

/* ─── Identity ─────────────────────────────────────────────────────────── */

const COMPANY_SUFFIXES = new Set(["inc", "llc", "ltd", "co", "corp", "corporation", "company", "plc"]);

/**
 * A merchant name as a bank prints it, reduced so the same merchant always matches itself:
 * `NETFLIX.COM`, `Netflix 8665` and `NETFLIX INC` all become `netflix`. Card-reader prefixes,
 * everything after a `*` or `#`, web suffixes, trailing store numbers and company suffixes go.
 */
export function normalizeMerchant(raw: string): string {
  let s = raw.normalize("NFKC").toLowerCase().trim();
  s = s.replace(/^(?:sq|tst)\s*\*\s*/, "");
  s = s.split(/[*#]/)[0] ?? "";
  s = s.replace(/\.(?:com|net|org|io|tv|co)\b/g, "");
  const tokens = s.split(/[^a-z0-9]+/).filter(Boolean);
  while (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1]!)) tokens.pop();
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(" ") || raw.toLowerCase().trim();
}

/** A fast, well-spread 53-bit string hash (cyrb53). It names things; it is not for secrets. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** An id that stays the same across syncs: the same account and merchant always give the same one. */
export function subscriptionId(accountId: string, merchant: string): string {
  return `sub_${hash53(`${accountId}|${normalizeMerchant(merchant)}`).toString(36)}`;
}

/* ─── Subscription or bill ─────────────────────────────────────────────── */

export interface KindInput {
  category: string | null;
  /** The charge is a loan or card payment with a due date from the bank's liability data. */
  isLiabilityPayment?: boolean;
  /** The user moved it. This wins over every rule. */
  override?: SubscriptionKind | null;
}

/**
 * Whether a repeating charge is a subscription or a bill, or null when it is neither (money the
 * user saves or invests, or income). Needs, loan payments and card payments are bills; wants and
 * charges with no known category are subscriptions.
 */
export function classifyKind(input: KindInput): SubscriptionKind | null {
  if (input.override) return input.override;
  if (input.isLiabilityPayment) return "bill";
  if (!input.category) return "subscription";
  if (topCategoryId(canonicalCategoryId(input.category)) === "transfers") return "bill";
  const bucket = categoryBucket(input.category);
  if (bucket === "needs") return "bill";
  if (bucket === "savings" || bucket === "excluded") return null;
  return "subscription";
}

/* ─── Duplicates ───────────────────────────────────────────────────────── */

interface GroupDef {
  label: string;
  /** Whole words or phrases in a normalized merchant name. */
  merchants: readonly string[];
  /** Subcategory ids that put an unlisted merchant in the group. */
  categories: readonly string[];
}

/** Services people pay for twice by accident. A short fixed list, so a flag always has a reason. */
const GROUPS: readonly GroupDef[] = [
  {
    label: "Video Streaming",
    merchants: ["netflix", "hulu", "disney", "hbo", "paramount", "peacock", "apple tv", "prime video", "youtube tv", "crunchyroll", "starz", "showtime"],
    categories: ["entertainment.streaming"],
  },
  {
    label: "Music Streaming",
    merchants: ["spotify", "apple music", "tidal", "pandora", "youtube music", "deezer", "amazon music"],
    categories: ["entertainment.music"],
  },
  { label: "Cloud Storage", merchants: ["icloud", "google one", "dropbox", "onedrive"], categories: [] },
  {
    label: "News",
    merchants: ["new york times", "nytimes", "wall street journal", "wsj", "washington post", "bloomberg", "economist", "financial times"],
    categories: [],
  },
  { label: "Gym & Fitness", merchants: ["peloton", "classpass"], categories: ["personal_care.gym"] },
];

const hasPhrase = (merchant: string, phrase: string) => ` ${merchant} `.includes(` ${phrase} `);

/** The group a subscription belongs to, or null. A listed merchant wins over its category. */
export function subscriptionGroup(merchant: string, category: string | null): string | null {
  const normalized = normalizeMerchant(merchant);
  const byName = GROUPS.find((g) => g.merchants.some((m) => hasPhrase(normalized, m)));
  if (byName) return byName.label;
  return GROUPS.find((g) => category !== null && g.categories.includes(category))?.label ?? null;
}

export interface GroupInput {
  id: string;
  merchant: string;
  category: string | null;
}

/** Each id that shares a group with at least one other, mapped to the group's label. */
export function duplicateGroups(items: readonly GroupInput[]): Map<string, string> {
  const byGroup = new Map<string, string[]>();
  for (const item of items) {
    const group = subscriptionGroup(item.merchant, item.category);
    if (group) byGroup.set(group, [...(byGroup.get(group) ?? []), item.id]);
  }
  const result = new Map<string, string>();
  for (const [group, ids] of byGroup) if (ids.length > 1) for (const id of ids) result.set(id, group);
  return result;
}

/* ─── What the charges themselves show ─────────────────────────────────── */

/** Past charges as positive amounts, oldest first. Refunds and credits (money in) are ignored. */
function paidCharges(history: readonly SubscriptionCharge[]): { date: string; cents: number }[] {
  return history
    .filter((c) => c.amountCents < 0)
    .map((c) => ({ date: c.date, cents: -c.amountCents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface PriceChange {
  previousCents: number;
  currentCents: number;
  /** The first charge at the new price. */
  changedOn: string;
}

const rose = (from: number, to: number) => to - from >= Math.max(PRICE_RISE_MIN_CENTS, Math.ceil(from * PRICE_RISE_MIN_SHARE));

/**
 * A recent rise in what a subscription charges: either a step between two charges, or a creep
 * that adds up against the charge a year earlier. Null when the price held, fell, rose by less
 * than the threshold, or last rose more than `PRICE_CHANGE_WINDOW_DAYS` ago.
 */
export function priceChange(history: readonly SubscriptionCharge[], today: string): PriceChange | null {
  const paid = paidCharges(history);
  const latest = paid[paid.length - 1];
  if (!latest || paid.length < 2) return null;
  const recent = (date: string) => daysApart(date, today) <= PRICE_CHANGE_WINDOW_DAYS;

  for (let i = paid.length - 1; i >= 1; i--) {
    const before = paid[i - 1]!;
    if (!rose(before.cents, paid[i]!.cents)) continue;
    // Only the latest rise counts, and only if the price is still up.
    if (rose(before.cents, latest.cents) && recent(paid[i]!.date)) {
      return { previousCents: before.cents, currentCents: latest.cents, changedOn: paid[i]!.date };
    }
    break;
  }

  const target = addDaysIso(latest.date, -365);
  const yearAgo = paid
    .filter((c) => c !== latest && Math.abs(daysApart(c.date, target)) <= YEAR_AGO_TOLERANCE_DAYS)
    .sort((a, b) => Math.abs(daysApart(a.date, target)) - Math.abs(daysApart(b.date, target)))[0];
  if (!yearAgo || !rose(yearAgo.cents, latest.cents)) return null;
  const crossed = paid.find((c) => c.date > yearAgo.date && rose(yearAgo.cents, c.cents));
  if (!crossed || !recent(crossed.date)) return null;
  return { previousCents: yearAgo.cents, currentCents: latest.cents, changedOn: crossed.date };
}

/**
 * Whether the first charge is recent. The ledger must reach back far enough before it, or a
 * long-running subscription would look new just because the history is short.
 */
export function startedRecently(history: readonly SubscriptionCharge[], ledgerStart: string | null, today: string): boolean {
  const first = paidCharges(history)[0];
  if (!first || ledgerStart === null) return false;
  return daysApart(first.date, today) <= STARTED_RECENTLY_DAYS && daysApart(ledgerStart, first.date) >= LEDGER_LOOKBACK_DAYS;
}

/** Days after a cancellation in which one more charge can still be the last one billed. */
export function cancelGraceDays(cadence: Cadence): number {
  return cadence === "unknown" ? MAX_CANCEL_GRACE_DAYS : Math.min(Math.ceil(DAYS_BETWEEN_CHARGES[cadence]), MAX_CANCEL_GRACE_DAYS);
}

/** The first charge that posted after a cancelled subscription should have stopped, or null. */
export function stillCharging(
  cancelledOn: string,
  cadence: Cadence,
  history: readonly SubscriptionCharge[],
): SubscriptionCharge | null {
  const cutoff = addDaysIso(cancelledOn, cancelGraceDays(cadence));
  return history.filter((c) => c.amountCents < 0 && c.date > cutoff).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** A yearly charge due soon, which people forget and then get surprised by. */
export function annualComing(cadence: Cadence, nextDate: string, today: string): boolean {
  if (cadence !== "yearly") return false;
  const days = daysApart(today, nextDate);
  return days >= 0 && days <= ANNUAL_WARNING_DAYS;
}

/**
 * What a confirmed cancellation has kept in the user's pocket: the charges that would have posted
 * since the last one, counted whole. Zero for an unknown cadence. Shown as a fact, not a forecast.
 */
export function savedSoFarCents(amountCents: number, cadence: Cadence, lastChargeDate: string, today: string): number {
  if (cadence === "unknown") return 0;
  const missed = Math.floor(Math.max(0, daysApart(lastChargeDate, today)) / DAYS_BETWEEN_CHARGES[cadence]);
  return missed * Math.abs(amountCents);
}

/* ─── Where it can be cancelled ────────────────────────────────────────── */

/**
 * Where a charge is billed, from the name the bank printed. A subscription bought through Apple,
 * Google Play or PayPal can only be cancelled there, not on the provider's own site, so the guide
 * differs. A guess from the descriptor: "direct" is the answer when none of these show.
 */
export function billingChannel(merchant: string): BillingChannel {
  const m = merchant.normalize("NFKC").toLowerCase().trim();
  if (/^apple\b|apple\.com\/bill|itunes|app store/.test(m)) return "apple";
  if (/^google\s*\*|google\s*play|googleplay/.test(m)) return "google_play";
  if (/^paypal\b/.test(m)) return "paypal";
  return "direct";
}
