/**
 * Plaid objects as rows for the Spacetime module's bank tables, in Spacetime's HTTP wire format
 * (SATS-JSON): snake_case field names, `{ some: v }` / `{ none: [] }` for options, and integer
 * cents for Plaid's dollars. Transaction and stream amounts keep Plaid's sign (positive is money
 * out); the app-facing conversion stays in ./map.ts.
 *
 * Used by apps/spacetime/scripts/seed.ts now, and by the Spacetime ledger store for real Plaid
 * syncs later. Column meanings are documented in apps/spacetime/src/index.ts.
 */
import type { DemoProfileSource } from "../profile";
import { toCents } from "./map";
import type { PlaidItemSnapshot, PlaidLiabilities, PlaidRecurringStream } from "./schema";

type Wire = { [key: string]: unknown };
const opt = <T>(value: T | null | undefined) => (value === null || value === undefined ? { none: [] } : { some: value });
const optCents = (dollars: number | null | undefined) => opt(dollars === null || dollars === undefined ? null : toCents(dollars));

/** camelCase keys to snake_case, recursively. Option wrappers ({ some } / { none }) pass through. */
export function toWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), toWire(v)]),
    );
  }
  return value;
}

function liabilityRows(liabilities: PlaidLiabilities, userId: string): Wire[] {
  const base = {
    aprs: [] as Wire[],
    interestRatePercentage: opt(null),
    lastPaymentAmountCents: opt(null),
    lastPaymentDate: opt(null),
    lastStatementBalanceCents: opt(null),
    isOverdue: opt(null),
    originationDate: opt(null),
    maturityDate: opt(null),
    originationPrincipalCents: opt(null),
    expectedPayoffDate: opt(null),
  };
  return [
    ...(liabilities.credit ?? []).map((c) => ({
      ...base,
      accountId: c.account_id,
      userId,
      kind: "credit",
      aprs: c.aprs.map((a) => ({ aprPercentage: a.apr_percentage, aprType: a.apr_type })),
      minimumPaymentCents: optCents(c.minimum_payment_amount),
      nextPaymentDueDate: opt(c.next_payment_due_date),
      lastPaymentAmountCents: optCents(c.last_payment_amount),
      lastPaymentDate: opt(c.last_payment_date),
      lastStatementBalanceCents: optCents(c.last_statement_balance),
      isOverdue: opt(c.is_overdue),
    })),
    ...(liabilities.mortgage ?? []).map((m) => ({
      ...base,
      accountId: m.account_id,
      userId,
      kind: "mortgage",
      interestRatePercentage: opt(m.interest_rate.percentage),
      minimumPaymentCents: optCents(m.next_monthly_payment),
      nextPaymentDueDate: opt(m.next_payment_due_date),
      originationDate: opt(m.origination_date),
      maturityDate: opt(m.maturity_date),
      originationPrincipalCents: optCents(m.origination_principal_amount),
    })),
    ...(liabilities.student ?? []).map((s) => ({
      ...base,
      accountId: s.account_id,
      userId,
      kind: "student",
      interestRatePercentage: opt(s.interest_rate_percentage),
      minimumPaymentCents: optCents(s.minimum_payment_amount),
      nextPaymentDueDate: opt(s.next_payment_due_date),
      expectedPayoffDate: opt(s.expected_payoff_date),
    })),
  ];
}

const streamRow = (s: PlaidRecurringStream, direction: "inflow" | "outflow", userId: string): Wire => ({
  streamId: s.stream_id,
  accountId: s.account_id,
  userId,
  direction,
  description: s.description,
  merchantName: opt(s.merchant_name),
  firstDate: s.first_date,
  lastDate: s.last_date,
  predictedNextDate: opt(s.predicted_next_date),
  frequency: s.frequency,
  transactionIds: s.transaction_ids,
  averageAmountCents: toCents(s.average_amount.amount),
  lastAmountCents: toCents(s.last_amount.amount),
  isActive: s.is_active,
  status: s.status,
  pfcPrimary: opt(s.personal_finance_category?.primary),
  pfcDetailed: opt(s.personal_finance_category?.detailed),
});

/** One Plaid Item as a `BankItemLoad` for the `load_profile` reducer (camelCase, options wrapped). */
export function bankItemLoad(snapshot: PlaidItemSnapshot, userId: string): Wire {
  return {
    item: {
      itemId: snapshot.item.item_id,
      institutionId: opt(snapshot.item.institution_id),
      institutionName: snapshot.item.institution_name,
      transactionsCursor: opt(snapshot.transactions_cursor),
      status: "good",
    },
    accounts: snapshot.accounts.map((a) => ({
      accountId: a.account_id,
      itemId: snapshot.item.item_id,
      userId,
      name: a.name,
      officialName: opt(a.official_name),
      mask: opt(a.mask),
      type: a.type,
      subtype: opt(a.subtype),
      currentCents: optCents(a.balances.current),
      availableCents: optCents(a.balances.available),
      limitCents: optCents(a.balances.limit),
      isoCurrencyCode: opt(a.balances.iso_currency_code),
    })),
    transactions: snapshot.transactions.map((t) => ({
      transactionId: t.transaction_id,
      accountId: t.account_id,
      userId,
      amountCents: toCents(t.amount),
      isoCurrencyCode: opt(t.iso_currency_code),
      date: t.date,
      authorizedDate: opt(t.authorized_date),
      name: t.name,
      merchantName: opt(t.merchant_name),
      merchantEntityId: opt(t.merchant_entity_id),
      logoUrl: opt(t.logo_url),
      website: opt(t.website),
      paymentChannel: t.payment_channel,
      pending: t.pending,
      pendingTransactionId: opt(t.pending_transaction_id),
      pfcPrimary: opt(t.personal_finance_category?.primary),
      pfcDetailed: opt(t.personal_finance_category?.detailed),
      pfcConfidence: opt(t.personal_finance_category?.confidence_level),
    })),
    liabilities: liabilityRows(snapshot.liabilities, userId),
    streams: [
      ...snapshot.recurring.inflow_streams.map((s) => streamRow(s, "inflow", userId)),
      ...snapshot.recurring.outflow_streams.map((s) => streamRow(s, "outflow", userId)),
    ],
    securities: snapshot.investments.securities.map((s) => ({
      securityId: s.security_id,
      name: opt(s.name),
      tickerSymbol: opt(s.ticker_symbol),
      type: opt(s.type),
      closePriceCents: optCents(s.close_price),
      closePriceAsOf: opt(s.close_price_as_of),
      isCashEquivalent: opt(s.is_cash_equivalent),
    })),
    holdings: snapshot.investments.holdings.map((h) => ({
      id: `${h.account_id}:${h.security_id}`,
      accountId: h.account_id,
      userId,
      securityId: h.security_id,
      quantity: h.quantity,
      institutionPriceCents: toCents(h.institution_price),
      institutionValueCents: toCents(h.institution_value),
      costBasisCents: optCents(h.cost_basis),
      isoCurrencyCode: opt(h.iso_currency_code),
    })),
  };
}

/** Positional arguments for the `load_profile` reducer, ready for JSON.stringify. */
export function loadProfileArgs(source: DemoProfileSource): unknown[] {
  const userId = source.user.id;
  const { user, income } = source;
  return toWire([
    {
      id: userId,
      displayName: user.displayName,
      email: opt(user.email),
      bufferTargetCents: user.preferences.bufferTargetCents,
      extensionEnabled: user.extensionSettings.enabled,
      snoozedSites: user.extensionSettings.snoozedSites,
    },
    { userId, ...income },
    source.goals.map((g) => ({
      id: g.id,
      userId,
      name: g.name,
      targetCents: g.targetCents,
      currentCents: g.currentCents,
      targetDate: g.targetDate,
      priorityRank: g.priorityRank,
      flexibility: g.flexibility,
      linkedAccountId: opt(g.linkedAccountId),
    })),
    source.bank.map((item) => bankItemLoad(item, userId)),
    Object.entries(source.accountDetails).map(([accountId, d]) => ({
      accountId,
      userId,
      annualRate: opt(d.annualRate),
      minimumPaymentCents: opt(d.minimumPaymentCents),
      promoRateEndsOn: opt(d.promoRateEndsOn),
    })),
    source.budgets.map((b) => ({ id: `${userId}:${b.category}`, userId, category: b.category, monthlyLimitCents: b.monthlyLimitCents })),
    source.balanceHistory.map((s) => ({ id: `${s.accountId}:${s.date}`, accountId: s.accountId, userId, date: s.date, balanceCents: s.balanceCents })),
  ]) as unknown[];
}
