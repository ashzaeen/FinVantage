import { z } from "zod";
import { Cents, Id, IsoDate, Rate } from "./common";

/** The seven stored values from PRD section 9, plus taxable brokerage accounts. */
export const AccountType = z.enum([
  "checking",
  "savings",
  "cd",
  "ira",
  "brokerage",
  "loan",
  "credit_card",
  "mortgage",
]);
export type AccountType = z.infer<typeof AccountType>;

/** The six PNC display categories, plus brokerage. CDs and IRAs share one. */
export const AccountCategory = z.enum([
  "checking",
  "savings",
  "cds_and_iras",
  "brokerage",
  "auto_and_personal_loans",
  "credit_cards",
  "mortgages",
]);
export type AccountCategory = z.infer<typeof AccountCategory>;

export const ACCOUNT_CATEGORY: Record<AccountType, AccountCategory> = {
  checking: "checking",
  savings: "savings",
  cd: "cds_and_iras",
  ira: "cds_and_iras",
  brokerage: "brokerage",
  loan: "auto_and_personal_loans",
  credit_card: "credit_cards",
  mortgage: "mortgages",
};

export const ACCOUNT_CATEGORY_LABEL: Record<AccountCategory, string> = {
  checking: "Checking",
  savings: "Savings",
  cds_and_iras: "CDs and IRAs",
  brokerage: "Brokerage",
  auto_and_personal_loans: "Auto and personal loans",
  credit_cards: "Credit cards",
  mortgages: "Mortgages",
};

export const LIABILITY_TYPES: readonly AccountType[] = ["loan", "credit_card", "mortgage"];

export function isLiability(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type);
}

export const Account = z.object({
  id: Id,
  userId: Id,
  type: AccountType,
  /** Set only when `type` is "loan". */
  loanKind: z.enum(["auto", "personal"]).nullable(),
  name: z.string(),
  institution: z.string(),
  /** Always positive: the amount held or the amount owed. `isLiability` gives the direction. */
  balanceCents: Cents.nonnegative(),
  annualRate: Rate.nullable(),
  minimumPaymentCents: Cents.nullable(),
  /** End of a 0% promo period on a credit card, used by the checkout scenario. */
  promoRateEndsOn: IsoDate.nullable(),
  // From the bank connection (Plaid). Null for manual accounts, or when the bank doesn't say.
  /** The bank's own subtype, such as "money market" or "student". `type` is the app's grouping. */
  subtype: z.string().nullable().default(null),
  /** Last 2 to 4 digits of the account number. */
  mask: z.string().nullable().default(null),
  /** Spendable balance (checking) or remaining credit (cards). */
  availableBalanceCents: Cents.nullable().default(null),
  creditLimitCents: Cents.nonnegative().nullable().default(null),
  /** Next bill due date for cards and loans. Feeds bill reminders. */
  nextPaymentDueOn: IsoDate.nullable().default(null),
});
export type Account = z.infer<typeof Account>;

export const NewAccount = Account.omit({ id: true, userId: true });
export type NewAccount = z.infer<typeof NewAccount>;

export const CurrencyCode = z.enum(["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR", "MXN"]);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const Transaction = z.object({
  id: Id,
  accountId: Id,
  date: IsoDate,
  /** Negative is money out, positive is money in. */
  amountCents: Cents,
  /** User-entered denomination. `amountCents` is normalized to USD for app-wide totals. */
  currency: CurrencyCode.default("USD"),
  /** Original signed amount in the selected currency's minor units. */
  originalAmountCents: Cents.nullable().default(null),
  /** Captured conversion used to normalize to USD; null for legacy transactions. */
  exchangeRateToUsd: Rate.nullable().default(null),
  exchangeRateDate: IsoDate.nullable().default(null),
  merchant: z.string(),
  /** The top-level spending category id, such as "dining_out". See `categories.ts`. */
  category: z.string().nullable(),
  /** The most specific subcategory id under `category`, such as "dining_out.coffee". */
  subcategory: z.string().nullable().default(null),
  isRecurring: z.boolean(),
  // From the bank connection (Plaid). Defaults for manual entries.
  /** Not yet posted. Pending transactions can change or disappear. */
  pending: z.boolean().default(false),
  /** The bank's detailed category, such as "FOOD_AND_DRINK_GROCERIES". */
  categoryDetailed: z.string().nullable().default(null),
  paymentChannel: z.enum(["online", "in_store", "other"]).nullable().default(null),
  logoUrl: z.string().nullable().default(null),
});
export type Transaction = z.infer<typeof Transaction>;

/** Fields accepted when creating or editing a transaction; normalized values are server-owned. */
export const NewTransaction = Transaction.omit({ id: true, category: true, isRecurring: true, originalAmountCents: true, exchangeRateToUsd: true, exchangeRateDate: true });
export type NewTransaction = z.infer<typeof NewTransaction>;

export const CreateTransaction = NewTransaction.extend({
  category: z.string().nullable().default(null),
  isRecurring: z.boolean().default(false),
});
export type CreateTransaction = z.infer<typeof CreateTransaction>;

/** One linked bank login (a Plaid Item), as the app shows it. Access tokens never leave the server. */
export const BankItemSummary = z.object({
  itemId: Id,
  institutionName: z.string(),
  /** "good", or why it needs attention, such as "login_required". */
  status: z.string(),
  accountCount: z.number().int().nonnegative(),
});
export type BankItemSummary = z.infer<typeof BankItemSummary>;

/** An account's balance on one day. Saved on each bank sync; net worth history is built from these. */
export const BalanceSnapshot = z.object({
  accountId: Id,
  date: IsoDate,
  balanceCents: Cents.nonnegative(),
});
export type BalanceSnapshot = z.infer<typeof BalanceSnapshot>;

export const NetWorth = z.object({
  assetsCents: Cents,
  liabilitiesCents: Cents,
  netWorthCents: Cents,
  byCategory: z.array(z.object({ category: AccountCategory, balanceCents: Cents })),
  history: z.array(z.object({ date: IsoDate, netWorthCents: Cents })),
});
export type NetWorth = z.infer<typeof NetWorth>;
