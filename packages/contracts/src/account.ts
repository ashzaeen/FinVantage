import { z } from "zod";
import { Cents, Id, IsoDate, Rate } from "./common";

/** The seven stored values from PRD section 9. */
export const AccountType = z.enum([
  "checking",
  "savings",
  "cd",
  "ira",
  "loan",
  "credit_card",
  "mortgage",
]);
export type AccountType = z.infer<typeof AccountType>;

/** The six PNC display categories. CDs and IRAs share one. */
export const AccountCategory = z.enum([
  "checking",
  "savings",
  "cds_and_iras",
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
  loan: "auto_and_personal_loans",
  credit_card: "credit_cards",
  mortgage: "mortgages",
};

export const ACCOUNT_CATEGORY_LABEL: Record<AccountCategory, string> = {
  checking: "Checking",
  savings: "Savings",
  cds_and_iras: "CDs and IRAs",
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
});
export type Account = z.infer<typeof Account>;

export const Transaction = z.object({
  id: Id,
  accountId: Id,
  date: IsoDate,
  /** Negative is money out, positive is money in. */
  amountCents: Cents,
  merchant: z.string(),
  category: z.string().nullable(),
  isRecurring: z.boolean(),
});
export type Transaction = z.infer<typeof Transaction>;

export const NewTransaction = Transaction.omit({ id: true, category: true, isRecurring: true });
export type NewTransaction = z.infer<typeof NewTransaction>;

export const NetWorth = z.object({
  assetsCents: Cents,
  liabilitiesCents: Cents,
  netWorthCents: Cents,
  byCategory: z.array(z.object({ category: AccountCategory, balanceCents: Cents })),
  history: z.array(z.object({ date: IsoDate, netWorthCents: Cents })),
});
export type NetWorth = z.infer<typeof NetWorth>;
