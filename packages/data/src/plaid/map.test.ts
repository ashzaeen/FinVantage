import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_CATEGORY } from "@finvantage/contracts";
import { loadDemoProfileFixture, loadDemoProfileSource } from "../profile";
import { accountTypeFor, categoryFor, mapItemSnapshot, mapTransaction } from "./map";
import { PlaidItemSnapshot, PlaidTransaction } from "./schema";

const plaidTxn = (over: Partial<PlaidTransaction> = {}): PlaidTransaction =>
  PlaidTransaction.parse({
    transaction_id: "t1",
    account_id: "a1",
    amount: 12.34,
    iso_currency_code: "USD",
    date: "2026-11-03",
    authorized_date: null,
    name: "GREEN GROCER #12",
    merchant_name: "Green Grocer",
    payment_channel: "in store",
    pending: false,
    personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_GROCERIES" },
    ...over,
  });

test("Plaid's money-out-positive dollars become negative cents", () => {
  const out = mapTransaction(plaidTxn({ amount: 12.34 }), new Set());
  assert.equal(out.amountCents, -1234);
  const refund = mapTransaction(plaidTxn({ amount: -5 }), new Set());
  assert.equal(refund.amountCents, 500);
  assert.equal(out.merchant, "Green Grocer");
  assert.equal(out.category, "groceries");
  assert.equal(out.subcategory, "groceries.groceries");
  assert.equal(out.categoryDetailed, "FOOD_AND_DRINK_GROCERIES");
  assert.equal(out.paymentChannel, "in_store");
  // Without a merchant name, Plaid's raw name is used.
  assert.equal(mapTransaction(plaidTxn({ merchant_name: null }), new Set()).merchant, "GREEN GROCER #12");
});

test("categories: detailed rules win, then primary, then unknown", () => {
  assert.equal(categoryFor({ primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_RESTAURANT" }), "dining_out");
  assert.equal(categoryFor({ primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" }), "entertainment");
  assert.equal(categoryFor({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" }), "housing");
  assert.equal(categoryFor({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CAR_PAYMENT" }), "debt_payments");
  // A detailed category we have no rule for falls back to its primary.
  assert.equal(categoryFor({ primary: "TRAVEL", detailed: "TRAVEL_SOMETHING_NEW" }), "travel");
  assert.equal(categoryFor({ primary: "SOMETHING_NEW", detailed: "SOMETHING_NEW_OTHER" }), null);
  assert.equal(categoryFor(null), null);
});

test("Plaid types and subtypes map to the app's account types", () => {
  const t = (type: "depository" | "credit" | "loan" | "investment" | "other", subtype: string | null) =>
    accountTypeFor({ type, subtype });
  assert.deepEqual(t("depository", "checking"), { type: "checking", loanKind: null });
  assert.deepEqual(t("depository", "money market"), { type: "savings", loanKind: null });
  assert.deepEqual(t("depository", "cd"), { type: "cd", loanKind: null });
  assert.deepEqual(t("credit", "credit card"), { type: "credit_card", loanKind: null });
  assert.deepEqual(t("loan", "auto"), { type: "loan", loanKind: "auto" });
  assert.deepEqual(t("loan", "student"), { type: "loan", loanKind: "personal" });
  assert.deepEqual(t("loan", "mortgage"), { type: "mortgage", loanKind: null });
  assert.deepEqual(t("investment", "roth"), { type: "ira", loanKind: null });
  assert.equal(t("investment", "brokerage"), null);
  assert.equal(t("other", null), null);
});

test("the demo fixture is valid Plaid data and maps to all six account categories", () => {
  const source = loadDemoProfileSource();
  for (const item of source.bank) PlaidItemSnapshot.parse(item);
  const profile = loadDemoProfileFixture();
  const categories = new Set(profile.accounts.map((a) => ACCOUNT_CATEGORY[a.type]));
  assert.equal(categories.size, 6);
  // PRD feature 2: every synthetic transaction categorizes without user input.
  assert.ok(profile.transactions.every((t) => t.category !== null));
});

test("rates, minimum payments, and due dates come from user details, then liabilities", () => {
  const byId = Object.fromEntries(loadDemoProfileFixture().accounts.map((a) => [a.id, a]));
  // Credit card: purchase APR, minimum payment, due date, limit, and available credit from Plaid.
  assert.equal(byId.acc_card!.annualRate, 0.2299);
  assert.equal(byId.acc_card!.minimumPaymentCents, 3500);
  assert.equal(byId.acc_card!.nextPaymentDueOn, "2026-11-20");
  assert.equal(byId.acc_card!.creditLimitCents, 500000);
  // A promotional ("special") APR wins over the purchase APR. The end date is user-entered.
  assert.equal(byId.acc_promo!.annualRate, 0);
  assert.equal(byId.acc_promo!.promoRateEndsOn, "2027-09-30");
  // Mortgage terms from Plaid's mortgage liability.
  assert.equal(byId.acc_mortgage!.annualRate, 0.0625);
  assert.equal(byId.acc_mortgage!.minimumPaymentCents, 46500);
  // Plaid has no terms for these, so they come from accountDetails.
  assert.equal(byId.acc_auto!.annualRate, 0.059);
  assert.equal(byId.acc_auto!.minimumPaymentCents, 34000);
  assert.equal(byId.acc_savings!.annualRate, 0.04);
  assert.equal(byId.acc_checking!.mask, "0042");
});

test("a rate the user entered beats the bank's", () => {
  const item = loadDemoProfileSource().bank[0]!;
  const card = mapItemSnapshot(item, "u", { acc_card: { annualRate: 0.1999, minimumPaymentCents: null, promoRateEndsOn: null } })
    .accounts.find((a) => a.id === "acc_card")!;
  assert.equal(card.annualRate, 0.1999);
  assert.equal(card.minimumPaymentCents, 3500, "unset fields still come from the bank");
});

test("transactions in an active recurring stream are flagged recurring; tombstoned streams don't count", () => {
  const source = loadDemoProfileSource();
  const item = source.bank[0]!;
  const mapped = mapItemSnapshot(item, "u");
  const recurring = new Set(mapped.transactions.filter((t) => t.isRecurring).map((t) => t.id));
  const streamIds = new Set(
    [...item.recurring.inflow_streams, ...item.recurring.outflow_streams].flatMap((s) => s.transaction_ids),
  );
  assert.deepEqual(recurring, streamIds);

  const tombstone = (s: (typeof item.recurring.outflow_streams)[number]) => ({ ...s, status: "TOMBSTONED" as const });
  const ended = {
    ...item,
    recurring: {
      inflow_streams: item.recurring.inflow_streams.map(tombstone),
      outflow_streams: item.recurring.outflow_streams.map(tombstone),
    },
  };
  assert.ok(mapItemSnapshot(ended, "u").transactions.every((t) => !t.isRecurring));
});

test("transactions on accounts the app can't place are dropped with the account", () => {
  const item = PlaidItemSnapshot.parse({
    item: { item_id: "i", institution_id: null, institution_name: "Broker" },
    accounts: [
      {
        account_id: "brk",
        balances: { available: null, current: 100, limit: null, iso_currency_code: "USD" },
        mask: null,
        name: "Taxable brokerage",
        official_name: null,
        type: "investment",
        subtype: "brokerage",
      },
    ],
    transactions: [plaidTxn({ account_id: "brk" })],
    transactions_cursor: null,
    liabilities: { credit: null, mortgage: null, student: null },
    recurring: { inflow_streams: [], outflow_streams: [] },
    investments: { holdings: [], securities: [] },
  });
  assert.deepEqual(mapItemSnapshot(item, "u"), { accounts: [], transactions: [] });
});
