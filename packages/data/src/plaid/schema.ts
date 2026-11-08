/**
 * Plaid's own objects, with Plaid's field names, units, and sign conventions, so a real Plaid
 * response parses unchanged. Amounts are dollars (numbers). Transaction `amount` is positive for
 * money out. Only the fields FinVantage uses are listed; Zod strips the rest.
 *
 * Reference: https://plaid.com/docs/api/ (accounts, transactions/sync, transactions/recurring,
 * liabilities, investments/holdings).
 *
 * Convert to the app's types with `mapBankSnapshot` in ./map.ts. Nothing outside packages/data
 * should depend on these shapes.
 */
import { z } from "zod";

const Dollars = z.number();
const PlaidDate = z.iso.date();

export const PlaidAccountType = z.enum(["depository", "credit", "loan", "investment", "brokerage", "other"]);
export type PlaidAccountType = z.infer<typeof PlaidAccountType>;

export const PlaidAccount = z.object({
  account_id: z.string().min(1),
  balances: z.object({
    available: Dollars.nullable(),
    current: Dollars.nullable(),
    limit: Dollars.nullable(),
    iso_currency_code: z.string().nullable(),
  }),
  mask: z.string().nullable(),
  name: z.string(),
  official_name: z.string().nullable(),
  type: PlaidAccountType,
  /** For example: checking, savings, cd, ira, credit card, auto, consumer, student, mortgage. */
  subtype: z.string().nullable(),
});
export type PlaidAccount = z.infer<typeof PlaidAccount>;

export const PlaidPersonalFinanceCategory = z.object({
  /** For example FOOD_AND_DRINK. */
  primary: z.string(),
  /** For example FOOD_AND_DRINK_GROCERIES. */
  detailed: z.string(),
  confidence_level: z.string().nullable().optional(),
});
export type PlaidPersonalFinanceCategory = z.infer<typeof PlaidPersonalFinanceCategory>;

export const PlaidTransaction = z.object({
  transaction_id: z.string().min(1),
  account_id: z.string().min(1),
  /** Positive is money out, negative is money in. */
  amount: Dollars,
  iso_currency_code: z.string().nullable(),
  date: PlaidDate,
  authorized_date: PlaidDate.nullable(),
  /** Deprecated by Plaid in favor of merchant_name, but always present. */
  name: z.string(),
  merchant_name: z.string().nullable(),
  merchant_entity_id: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  payment_channel: z.enum(["online", "in store", "other"]),
  pending: z.boolean(),
  pending_transaction_id: z.string().nullable().optional(),
  personal_finance_category: PlaidPersonalFinanceCategory.nullable(),
});
export type PlaidTransaction = z.infer<typeof PlaidTransaction>;

/** One page of /transactions/sync. Apply `added`, `modified`, then `removed`, then save the cursor. */
export const PlaidTransactionsSync = z.object({
  added: z.array(PlaidTransaction),
  modified: z.array(PlaidTransaction),
  removed: z.array(z.object({ transaction_id: z.string(), account_id: z.string().optional() })),
  next_cursor: z.string(),
  has_more: z.boolean(),
});
export type PlaidTransactionsSync = z.infer<typeof PlaidTransactionsSync>;

export const PlaidCreditLiability = z.object({
  account_id: z.string(),
  aprs: z.array(
    z.object({
      /** Percent: 24.99 means 24.99%. */
      apr_percentage: z.number(),
      apr_type: z.enum(["balance_transfer_apr", "cash_apr", "purchase_apr", "special"]),
      balance_subject_to_apr: Dollars.nullable().optional(),
    }),
  ),
  is_overdue: z.boolean().nullable(),
  last_payment_amount: Dollars.nullable(),
  last_payment_date: PlaidDate.nullable(),
  last_statement_balance: Dollars.nullable(),
  minimum_payment_amount: Dollars.nullable(),
  next_payment_due_date: PlaidDate.nullable(),
});
export type PlaidCreditLiability = z.infer<typeof PlaidCreditLiability>;

export const PlaidMortgageLiability = z.object({
  account_id: z.string(),
  interest_rate: z.object({ percentage: z.number().nullable(), type: z.string().nullable() }),
  next_monthly_payment: Dollars.nullable(),
  next_payment_due_date: PlaidDate.nullable(),
  origination_date: PlaidDate.nullable(),
  maturity_date: PlaidDate.nullable(),
  origination_principal_amount: Dollars.nullable(),
});
export type PlaidMortgageLiability = z.infer<typeof PlaidMortgageLiability>;

export const PlaidStudentLiability = z.object({
  account_id: z.string(),
  interest_rate_percentage: z.number().nullable(),
  minimum_payment_amount: Dollars.nullable(),
  next_payment_due_date: PlaidDate.nullable(),
  expected_payoff_date: PlaidDate.nullable(),
});
export type PlaidStudentLiability = z.infer<typeof PlaidStudentLiability>;

export const PlaidLiabilities = z.object({
  credit: z.array(PlaidCreditLiability).nullable(),
  mortgage: z.array(PlaidMortgageLiability).nullable(),
  student: z.array(PlaidStudentLiability).nullable(),
});
export type PlaidLiabilities = z.infer<typeof PlaidLiabilities>;

export const PlaidRecurringFrequency = z.enum(["UNKNOWN", "WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"]);
export type PlaidRecurringFrequency = z.infer<typeof PlaidRecurringFrequency>;

const PlaidAmount = z.object({ amount: Dollars, iso_currency_code: z.string().nullable() });

export const PlaidRecurringStream = z.object({
  stream_id: z.string(),
  account_id: z.string(),
  description: z.string(),
  merchant_name: z.string().nullable(),
  first_date: PlaidDate,
  last_date: PlaidDate,
  predicted_next_date: PlaidDate.nullable(),
  frequency: PlaidRecurringFrequency,
  transaction_ids: z.array(z.string()),
  /** Same sign as transactions: positive for outflow streams. */
  average_amount: PlaidAmount,
  last_amount: PlaidAmount,
  is_active: z.boolean(),
  status: z.enum(["UNKNOWN", "MATURE", "EARLY_DETECTION", "TOMBSTONED"]),
  personal_finance_category: PlaidPersonalFinanceCategory.nullable(),
});
export type PlaidRecurringStream = z.infer<typeof PlaidRecurringStream>;

export const PlaidSecurity = z.object({
  security_id: z.string(),
  name: z.string().nullable(),
  ticker_symbol: z.string().nullable(),
  type: z.enum(["cash", "cryptocurrency", "derivative", "equity", "etf", "fixed income", "loan", "mutual fund", "other"]).nullable(),
  close_price: Dollars.nullable(),
  close_price_as_of: PlaidDate.nullable(),
  is_cash_equivalent: z.boolean().nullable(),
});
export type PlaidSecurity = z.infer<typeof PlaidSecurity>;

export const PlaidHolding = z.object({
  account_id: z.string(),
  security_id: z.string(),
  quantity: z.number(),
  institution_price: Dollars,
  institution_value: Dollars,
  cost_basis: Dollars.nullable(),
  iso_currency_code: z.string().nullable(),
});
export type PlaidHolding = z.infer<typeof PlaidHolding>;

/**
 * Everything FinVantage keeps from one Plaid Item (one bank login): the item, its institution,
 * and the results of /accounts/get, /transactions/sync, /transactions/recurring/get,
 * /liabilities/get, and /investments/holdings/get. The synthetic demo profile uses this exact
 * shape, so it goes through the same mapper as real Plaid data.
 */
export const PlaidItemSnapshot = z.object({
  item: z.object({
    item_id: z.string(),
    institution_id: z.string().nullable(),
    institution_name: z.string(),
  }),
  accounts: z.array(PlaidAccount),
  transactions: z.array(PlaidTransaction),
  /** The /transactions/sync cursor after `transactions` were applied. Null before the first sync. */
  transactions_cursor: z.string().nullable(),
  liabilities: PlaidLiabilities,
  recurring: z.object({ inflow_streams: z.array(PlaidRecurringStream), outflow_streams: z.array(PlaidRecurringStream) }),
  investments: z.object({ holdings: z.array(PlaidHolding), securities: z.array(PlaidSecurity) }),
});
export type PlaidItemSnapshot = z.infer<typeof PlaidItemSnapshot>;
