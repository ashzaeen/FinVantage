import type { SubscriptionState } from "@finvantage/data";
import {
  type RecurringCharge,
  type ReportSubscriptions,
  type Subscription,
  type SubscriptionCharge,
  type SubscriptionDetail,
  type SubscriptionFlag,
  type SubscriptionOverview,
  type Transaction,
} from "@finvantage/contracts";
import {
  annualComing,
  annualCostCents,
  classifyKind,
  duplicateGroups,
  monthlyCostCents,
  normalizeMerchant,
  priceChange,
  savedSoFarCents,
  shareOfIncome,
  startedRecently,
  stillCharging,
  subscriptionId,
  sumCosts,
} from "@finvantage/math-core";
import type { AppDeps } from "../deps";
import { liabilityBills, recurringChargesFor, withoutCoveredStreams } from "./recurring";

/** How many past charges a subscription's detail carries. */
export const DETAIL_HISTORY_LIMIT = 36;

export interface SubscriptionInput {
  /** The bank's recurring streams, or the estimate from transactions. */
  charges: RecurringCharge[];
  /** Loan and card payments with a due date. A stream for the same kind of payment is dropped. */
  loans: RecurringCharge[];
  transactions: Transaction[];
  monthlyIncomeCents: number | null;
  today: string;
  /** What the user chose about each subscription. */
  states: readonly SubscriptionState[];
}

const historyKey = (accountId: string, merchant: string) => `${accountId}|${normalizeMerchant(merchant)}`;

function sortByCost(a: Subscription, b: Subscription): number {
  if (a.monthlyCents === null || b.monthlyCents === null) {
    if (a.monthlyCents !== b.monthlyCents) return a.monthlyCents === null ? 1 : -1;
  } else if (a.monthlyCents !== b.monthlyCents) {
    return b.monthlyCents - a.monthlyCents;
  }
  return a.merchant.localeCompare(b.merchant);
}

/**
 * Every repeating charge as a subscription or a bill, with its cost and what is worth a look.
 * Charges that are neither (saving, investing, income) are left out. Pure: the route supplies
 * the data. The user's choices are applied here: a chosen group wins over the rule, "keep" mutes
 * the flags, and a cancelled subscription stays listed from its saved snapshot after the bank's
 * stream ends, flagged if charges continue and credited with what it has saved if they stopped.
 */
export function buildSubscriptions(input: SubscriptionInput): SubscriptionDetail[] {
  const { transactions, today } = input;
  const stateOf = new Map(input.states.map((s) => [s.id, s]));
  const items = [
    ...input.loans.map((charge) => ({ charge, isLiabilityPayment: true })),
    ...withoutCoveredStreams(input.charges, input.loans).map((charge) => ({ charge, isLiabilityPayment: false })),
    // A cancelled subscription's stream ends at the bank; its snapshot keeps it on the list.
    ...input.states.filter((s) => s.status === "cancelled").map((s) => ({ charge: s.charge, isLiabilityPayment: false })),
  ].flatMap((item) => {
    const id = subscriptionId(item.charge.accountId, item.charge.merchant);
    const kind = classifyKind({ category: item.charge.category, isLiabilityPayment: item.isLiabilityPayment, override: stateOf.get(id)?.kind });
    return kind ? [{ ...item, kind, id }] : [];
  });

  // The same account and merchant can appear twice (a stream and a due date, or a stream and its
  // snapshot); keep the first, which is the live one.
  const seen = new Set<string>();
  const unique = items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));

  const charged = new Map<string, SubscriptionCharge[]>();
  let ledgerStart: string | null = null;
  for (const t of transactions) {
    if (t.pending) continue;
    if (ledgerStart === null || t.date < ledgerStart) ledgerStart = t.date;
    if (t.amountCents >= 0) continue;
    const key = historyKey(t.accountId, t.merchant);
    charged.set(key, [...(charged.get(key) ?? []), { date: t.date, amountCents: t.amountCents }]);
  }

  const duplicates = duplicateGroups(
    unique.filter((i) => i.kind === "subscription").map((i) => ({ id: i.id, merchant: i.charge.merchant, category: i.charge.category })),
  );

  return unique.map(({ charge, kind, id }) => {
    const history = (charged.get(historyKey(charge.accountId, charge.merchant)) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    // A subscription has one price, so it costs what it last charged; the bank's average would sit
    // between the old and new price after a rise. A bill varies, so it keeps the bank's usual amount.
    const latest = history[history.length - 1];
    const amountCents = kind === "subscription" && latest ? latest.amountCents : charge.amountCents;
    const state = stateOf.get(id);
    const status = state?.status ?? "active";
    const cancelledOn = status === "cancelled" ? (state?.cancelledOn ?? null) : null;
    const flags: SubscriptionFlag[] = [];
    let saved: number | null = null;
    if (status === "cancelled") {
      // Only one thing matters once it is cancelled: did the charges stop?
      const again = cancelledOn ? stillCharging(cancelledOn, charge.cadence, history) : null;
      if (again) flags.push({ type: "still_charging", previousCents: null, changedOn: again.date, group: null });
      else if (cancelledOn) saved = savedSoFarCents(amountCents, charge.cadence, latest?.date ?? cancelledOn, today);
    } else if (status !== "keep") {
      const change = priceChange(history, today);
      if (change) flags.push({ type: "price_up", previousCents: change.previousCents, changedOn: change.changedOn, group: null });
      const group = duplicates.get(id);
      if (group) flags.push({ type: "possible_duplicate", previousCents: null, changedOn: null, group });
      if (startedRecently(history, ledgerStart, today)) flags.push({ type: "started_recently", previousCents: null, changedOn: null, group: null });
      if (annualComing(charge.cadence, charge.nextDate, today)) flags.push({ type: "annual_coming", previousCents: null, changedOn: null, group: null });
    }
    return {
      ...charge,
      amountCents,
      id,
      kind,
      status,
      cancelledOn,
      savedSoFarCents: saved,
      monthlyCents: monthlyCostCents(amountCents, charge.cadence),
      annualCents: annualCostCents(amountCents, charge.cadence),
      lastChargeDate: latest?.date ?? null,
      flags,
      history: history.slice(-DETAIL_HISTORY_LIMIT),
    };
  });
}

/** The overview the page shows: subscriptions and bills by cost, with totals. */
export function overviewOf(details: SubscriptionDetail[], monthlyIncomeCents: number | null): SubscriptionOverview {
  // The list leaves out the history; the detail route carries it.
  const rows: Subscription[] = details.map(({ history: _history, ...row }) => row);
  const by = (kind: Subscription["kind"], cancelled: boolean) =>
    rows.filter((r) => r.kind === kind && (r.status === "cancelled") === cancelled).sort(sortByCost);
  const subscriptions = by("subscription", false);
  const bills = by("bill", false);
  // A cancelled charge that keeps posting still costs money, so it stays in the totals until it stops.
  const stillCosting = (kind: Subscription["kind"]) =>
    rows.filter((r) => r.kind === kind && r.status === "cancelled" && r.flags.some((f) => f.type === "still_charging")).map((r) => ({ ...r, status: "active" as const }));
  const subscriptionTotals = sumCosts([...subscriptions, ...stillCosting("subscription")]);
  return {
    subscriptions,
    bills,
    cancelled: rows.filter((r) => r.status === "cancelled").sort(sortByCost),
    subscriptionTotals,
    billTotals: sumCosts([...bills, ...stillCosting("bill")]),
    shareOfIncome: shareOfIncome(subscriptionTotals.monthlyCents, monthlyIncomeCents),
    savedSoFarCents: rows.reduce((sum, r) => sum + (r.savedSoFarCents ?? 0), 0),
  };
}

/** The date of the earliest posted transaction, or null with none. Past that, the ledger says nothing. */
export function ledgerStartOf(transactions: readonly Transaction[]): string | null {
  let start: string | null = null;
  for (const t of transactions) if (!t.pending && (start === null || t.date < start)) start = t.date;
  return start;
}

/** Everything the Subscriptions page and the quarterly report need, loaded for one user. */
export async function loadSubscriptions(deps: AppDeps, userId: string) {
  const [charges, accounts, transactions, income, states] = await Promise.all([
    recurringChargesFor(deps, userId),
    deps.ledger.listAccounts(userId),
    deps.ledger.listTransactions(userId, 5000),
    deps.ledger.getIncomeProfile(userId),
    deps.subscriptions.list(userId),
  ]);
  const monthlyIncomeCents = income?.monthlyIncomeCents ?? null;
  return {
    monthlyIncomeCents,
    states,
    ledgerStart: ledgerStartOf(transactions),
    details: buildSubscriptions({ charges, loans: liabilityBills(accounts), transactions, monthlyIncomeCents, today: deps.today(), states }),
  };
}

interface Window {
  start: string;
  endInclusive: string;
}

/**
 * What subscriptions cost in a quarter and the one before it, from the charges that posted. Null
 * when there are no subscriptions, or the ledger does not reach back over the whole quarter (a
 * part-quarter would read as a saving). The previous quarter's figure is null on its own when the
 * ledger does not cover it, so there is no change to show rather than a false one.
 */
export function quarterSubscriptions(
  details: readonly SubscriptionDetail[],
  current: Window,
  previous: Window,
  ledgerStart: string | null,
): ReportSubscriptions | null {
  const subscriptions = details.filter((d) => d.kind === "subscription");
  if (subscriptions.length === 0 || ledgerStart === null || ledgerStart > current.start) return null;
  const within = (date: string, w: Window) => date >= w.start && date <= w.endInclusive;
  const spend = (w: Window) =>
    subscriptions.reduce((sum, d) => sum + d.history.filter((h) => within(h.date, w)).reduce((s, h) => s + Math.abs(h.amountCents), 0), 0);
  const spendCents = spend(current);
  const previousSpendCents = ledgerStart <= previous.start ? spend(previous) : null;
  return {
    spendCents,
    previousSpendCents,
    changeCents: previousSpendCents === null ? null : spendCents - previousSpendCents,
    chargedCount: subscriptions.filter((d) => d.history.some((h) => within(h.date, current))).length,
    cancelled: subscriptions
      .filter((d) => d.status === "cancelled" && d.cancelledOn !== null && within(d.cancelledOn, current))
      .map((d) => ({ merchant: d.merchant, cancelledOn: d.cancelledOn!, monthlyCents: d.monthlyCents })),
  };
}
