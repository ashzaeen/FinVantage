import {
  type RecurringCharge,
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
  shareOfIncome,
  startedRecently,
  subscriptionId,
  sumCosts,
} from "@finvantage/math-core";
import { withoutCoveredStreams } from "./recurring";

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
 * the data. Statuses are all "active" until the user's choices are stored.
 */
export function buildSubscriptions(input: SubscriptionInput): SubscriptionDetail[] {
  const { transactions, today } = input;
  const items = [
    ...input.loans.map((charge) => ({ charge, isLiabilityPayment: true })),
    ...withoutCoveredStreams(input.charges, input.loans).map((charge) => ({ charge, isLiabilityPayment: false })),
  ].flatMap((item) => {
    const kind = classifyKind({ category: item.charge.category, isLiabilityPayment: item.isLiabilityPayment });
    return kind ? [{ ...item, kind, id: subscriptionId(item.charge.accountId, item.charge.merchant) }] : [];
  });

  // The same account and merchant can appear twice (a stream and a due date); keep the first.
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
    const flags: SubscriptionFlag[] = [];
    const change = priceChange(history, today);
    if (change) flags.push({ type: "price_up", previousCents: change.previousCents, changedOn: change.changedOn, group: null });
    const group = duplicates.get(id);
    if (group) flags.push({ type: "possible_duplicate", previousCents: null, changedOn: null, group });
    if (startedRecently(history, ledgerStart, today)) flags.push({ type: "started_recently", previousCents: null, changedOn: null, group: null });
    if (annualComing(charge.cadence, charge.nextDate, today)) flags.push({ type: "annual_coming", previousCents: null, changedOn: null, group: null });
    return {
      ...charge,
      id,
      kind,
      status: "active" as const,
      monthlyCents: monthlyCostCents(charge.amountCents, charge.cadence),
      annualCents: annualCostCents(charge.amountCents, charge.cadence),
      lastChargeDate: history[history.length - 1]?.date ?? null,
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
  const subscriptionTotals = sumCosts(subscriptions);
  return {
    subscriptions,
    bills,
    cancelled: rows.filter((r) => r.status === "cancelled").sort(sortByCost),
    subscriptionTotals,
    billTotals: sumCosts(bills),
    shareOfIncome: shareOfIncome(subscriptionTotals.monthlyCents, monthlyIncomeCents),
  };
}
