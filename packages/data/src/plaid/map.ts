/**
 * Turns Plaid objects into the app's Account and Transaction (from @finvantage/contracts). This
 * is the only place that knows Plaid's conventions:
 * - Plaid amounts are dollars, and a positive transaction amount is money OUT. The app uses
 *   integer cents, and negative is money out.
 * - Plaid's type and subtype become the app's AccountTypes. Accounts the app can't place
 *   ("other") are skipped; their holdings still reach the portfolio.
 * - Rates, minimum payments, and due dates come from /liabilities/get. Plaid has none for CDs,
 *   savings, or auto and personal loans, and no promo end dates, so those come from
 *   user-entered `AccountDetails`. A value the user entered always wins over the bank's.
 */
import { z } from "zod";
import { Account, IsoDate, Rate, Transaction, categorizePlaid, type AccountType } from "@finvantage/contracts";
import type {
  PlaidAccount,
  PlaidItemSnapshot,
  PlaidLiabilities,
  PlaidPersonalFinanceCategory,
  PlaidRecurringStream,
  PlaidTransaction,
} from "./schema";

/** What a person enters for an account because the bank doesn't provide it. */
export const AccountDetails = z.object({
  annualRate: Rate.nullable().default(null),
  minimumPaymentCents: z.number().int().nullable().default(null),
  promoRateEndsOn: IsoDate.nullable().default(null),
});
export type AccountDetails = z.infer<typeof AccountDetails>;

export const toCents = (dollars: number) => Math.round(dollars * 100);
/** Plaid percent (3.99) to the app's decimal rate (0.0399), without floating-point tails. */
const percentToRate = (percent: number) => Math.round(percent * 10_000) / 1_000_000;

const RETIREMENT_SUBTYPES = new Set([
  "ira", "roth", "401k", "roth 401k", "403b", "457b", "401a", "sep ira", "simple ira", "keogh",
  "sarsep", "pension", "retirement", "thrift savings plan",
]);

/** The app's grouping for a Plaid account, or null if the app has no place for it. */
export function accountTypeFor(account: Pick<PlaidAccount, "type" | "subtype">):
  | { type: AccountType; loanKind: "auto" | "personal" | null }
  | null {
  const subtype = account.subtype?.toLowerCase() ?? "";
  switch (account.type) {
    case "depository":
      if (subtype === "cd") return { type: "cd", loanKind: null };
      if (["savings", "money market", "hsa", "cash management"].includes(subtype)) {
        return { type: "savings", loanKind: null };
      }
      return { type: "checking", loanKind: null };
    case "credit":
      return { type: "credit_card", loanKind: null };
    case "loan":
      if (subtype === "mortgage" || subtype === "home equity") return { type: "mortgage", loanKind: null };
      return { type: "loan", loanKind: subtype === "auto" ? "auto" : "personal" };
    case "investment":
    case "brokerage":
      if (RETIREMENT_SUBTYPES.has(subtype)) return { type: "ira", loanKind: null };
      return subtype === "brokerage" ? { type: "brokerage", loanKind: null } : null;
    default:
      return null;
  }
}

/**
 * Rule-based categorization from Plaid's personal finance category (PRD feature 2), using the
 * spending categories in `@finvantage/contracts`. Returns the top-level category. Null means
 * unknown: the LLM fallback's job.
 */
export function categoryFor(pfc: PlaidPersonalFinanceCategory | null): string | null {
  return categorizePlaid(pfc).category;
}

interface LiabilityTerms {
  annualRate: number | null;
  /** A card's "special" (promotional) APR, used only when the promo's end date is known. */
  promoRate: number | null;
  minimumPaymentCents: number | null;
  nextPaymentDueOn: string | null;
}

function liabilityTerms(liabilities: PlaidLiabilities): Map<string, LiabilityTerms> {
  const terms = new Map<string, LiabilityTerms>();
  for (const card of liabilities.credit ?? []) {
    // The purchase APR is what new spending on the card costs. A "special" APR (a 0% intro offer)
    // may cover only part of the balance, and Plaid gives no end date, so it applies only when the
    // user has entered when the promo ends (see mapAccount). Plaid Sandbox's card, for one, has a
    // 0% special APR on $1,000 next to a 12.5% purchase APR.
    const special = card.aprs.find((a) => a.apr_type === "special");
    const apr = card.aprs.find((a) => a.apr_type === "purchase_apr") ?? card.aprs.find((a) => a.apr_type !== "special") ?? special;
    terms.set(card.account_id, {
      annualRate: apr ? percentToRate(apr.apr_percentage) : null,
      promoRate: special ? percentToRate(special.apr_percentage) : null,
      minimumPaymentCents: card.minimum_payment_amount === null ? null : toCents(card.minimum_payment_amount),
      nextPaymentDueOn: card.next_payment_due_date,
    });
  }
  for (const loan of liabilities.mortgage ?? []) {
    terms.set(loan.account_id, {
      annualRate: loan.interest_rate.percentage === null ? null : percentToRate(loan.interest_rate.percentage),
      promoRate: null,
      minimumPaymentCents: loan.next_monthly_payment === null ? null : toCents(loan.next_monthly_payment),
      nextPaymentDueOn: loan.next_payment_due_date,
    });
  }
  for (const loan of liabilities.student ?? []) {
    terms.set(loan.account_id, {
      annualRate: loan.interest_rate_percentage === null ? null : percentToRate(loan.interest_rate_percentage),
      promoRate: null,
      minimumPaymentCents: loan.minimum_payment_amount === null ? null : toCents(loan.minimum_payment_amount),
      nextPaymentDueOn: loan.next_payment_due_date,
    });
  }
  return terms;
}

function mapAccount(
  account: PlaidAccount,
  userId: string,
  institution: string,
  terms: LiabilityTerms | undefined,
  details: AccountDetails | undefined,
): Account | null {
  const kind = accountTypeFor(account);
  if (!kind) return null;
  const { current, available, limit } = account.balances;
  return Account.parse({
    id: account.account_id,
    userId,
    type: kind.type,
    loanKind: kind.loanKind,
    name: account.name,
    institution,
    // Plaid reports what is owed on cards and loans as a positive current balance.
    balanceCents: Math.max(0, toCents(current ?? available ?? 0)),
    // What the user set wins; the bank fills in the rest. A promo rate counts only with a known end.
    annualRate:
      details?.annualRate ??
      (details?.promoRateEndsOn && terms?.promoRate != null ? terms.promoRate : terms?.annualRate) ??
      null,
    minimumPaymentCents: details?.minimumPaymentCents ?? terms?.minimumPaymentCents ?? null,
    promoRateEndsOn: details?.promoRateEndsOn ?? null,
    subtype: account.subtype,
    mask: account.mask,
    availableBalanceCents: available === null ? null : toCents(available),
    creditLimitCents: limit === null ? null : toCents(limit),
    nextPaymentDueOn: terms?.nextPaymentDueOn ?? null,
  });
}

/** Transaction ids that belong to a live recurring stream. */
export function recurringTransactionIds(streams: PlaidRecurringStream[]): Set<string> {
  return new Set(
    streams.filter((s) => s.is_active && s.status !== "TOMBSTONED").flatMap((s) => s.transaction_ids),
  );
}

export function mapTransaction(transaction: PlaidTransaction, recurringIds: Set<string>): Transaction {
  return Transaction.parse({
    id: transaction.transaction_id,
    accountId: transaction.account_id,
    date: transaction.date,
    amountCents: -toCents(transaction.amount),
    merchant: transaction.merchant_name ?? transaction.name,
    ...categorizePlaid(transaction.personal_finance_category),
    isRecurring: recurringIds.has(transaction.transaction_id),
    pending: transaction.pending,
    categoryDetailed: transaction.personal_finance_category?.detailed ?? null,
    paymentChannel: transaction.payment_channel === "in store" ? "in_store" : transaction.payment_channel,
    logoUrl: transaction.logo_url ?? null,
  });
}

/** One Plaid Item's data as the app's accounts and transactions. */
export function mapItemSnapshot(
  snapshot: PlaidItemSnapshot,
  userId: string,
  details: Record<string, AccountDetails> = {},
): { accounts: Account[]; transactions: Transaction[] } {
  const terms = liabilityTerms(snapshot.liabilities);
  const accounts = snapshot.accounts
    .map((a) => mapAccount(a, userId, snapshot.item.institution_name, terms.get(a.account_id), details[a.account_id]))
    .filter((a): a is Account => a !== null);
  const known = new Set(accounts.map((a) => a.id));
  const recurringIds = recurringTransactionIds([
    ...snapshot.recurring.inflow_streams,
    ...snapshot.recurring.outflow_streams,
  ]);
  const transactions = snapshot.transactions
    .filter((t) => known.has(t.account_id))
    .map((t) => mapTransaction(t, recurringIds));
  return { accounts, transactions };
}
