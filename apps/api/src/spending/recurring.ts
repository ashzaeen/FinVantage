import { PLAID_DETAILED_CATEGORY, type Account, type RecurringCharge, type Transaction } from "@finvantage/contracts";
import type { RecurringStream } from "@finvantage/data";
import type { AppDeps } from "../deps";

/*
 * Recurring charges as the Spending and Subscriptions routes share them: the bank's recurring
 * streams, an estimate from transactions when there are none, and loan and card payments from
 * the bank's due dates.
 */

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

const CADENCE: Record<RecurringStream["frequency"], RecurringCharge["cadence"]> = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  SEMI_MONTHLY: "semi_monthly",
  MONTHLY: "monthly",
  ANNUALLY: "yearly",
  UNKNOWN: "unknown",
};

export function streamCharge(stream: RecurringStream): RecurringCharge | null {
  if (!stream.predictedNextDate) return null;
  const mapped = stream.categoryDetailed ? PLAID_DETAILED_CATEGORY[stream.categoryDetailed] : undefined;
  return {
    merchant: stream.merchant,
    amountCents: -stream.amountCents,
    cadence: CADENCE[stream.frequency],
    nextDate: stream.predictedNextDate,
    accountId: stream.accountId,
    category: mapped ?? null,
    source: "bank",
  };
}

/** The category a loan or card payment falls in, matching how Plaid categorizes the payment. */
function liabilityCategory(account: Account): string {
  if (account.type === "mortgage") return "housing.mortgage";
  if (account.type === "credit_card") return "transfers.credit_card_payment";
  // `loanKind` has no student value yet, so student loans read as personal loans.
  return account.loanKind === "auto" ? "debt_payments.car" : "debt_payments.personal";
}

/** Loan and card payments with a due date, from the bank's liability data. */
export function liabilityBills(accounts: Account[]): RecurringCharge[] {
  return accounts.flatMap((a) =>
    a.nextPaymentDueOn && a.minimumPaymentCents
      ? [
          {
            merchant: a.name,
            amountCents: -a.minimumPaymentCents,
            cadence: "monthly" as const,
            nextDate: a.nextPaymentDueOn,
            accountId: a.id,
            category: liabilityCategory(a),
            source: "bank" as const,
          },
        ]
      : [],
  );
}

/** Without the bank's streams: recurring transactions, assumed monthly. */
export function estimatedCharges(transactions: Transaction[]): RecurringCharge[] {
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.isRecurring || t.amountCents >= 0) continue;
    const key = `${t.accountId}:${t.merchant.toLowerCase()}`;
    const previous = latest.get(key);
    if (!previous || t.date > previous.date) latest.set(key, t);
  }
  return [...latest.values()].map((t) => ({
    merchant: t.merchant,
    amountCents: t.amountCents,
    cadence: "monthly" as const,
    nextDate: addDays(t.date, 30),
    accountId: t.accountId,
    category: t.subcategory ?? t.category,
    source: "estimate" as const,
  }));
}

/** A due date already covers that kind of payment, so drop its matching stream. */
export function withoutCoveredStreams(charges: RecurringCharge[], loans: RecurringCharge[]): RecurringCharge[] {
  const covered = new Set(loans.map((l) => l.category));
  return charges.filter((c) => !c.category || !covered.has(c.category));
}

/** The user's recurring charges: the bank's streams, else an estimate from their transactions. */
export async function recurringChargesFor(deps: AppDeps, userId: string): Promise<RecurringCharge[]> {
  const streams = (await deps.ledger.listRecurringStreams?.(userId)) ?? [];
  const fromBank = streams.flatMap((s) => streamCharge(s) ?? []);
  return fromBank.length ? fromBank : estimatedCharges(await deps.ledger.listTransactions(userId, 5000));
}
