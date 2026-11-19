import assert from "node:assert/strict";
import { test } from "node:test";
import type { RecurringCharge, Transaction } from "@finvantage/contracts";
import { buildSubscriptions, overviewOf, type SubscriptionInput } from "./subscriptions";

const TODAY = "2026-11-20";

function charge(merchant: string, amountCents: number, overrides: Partial<RecurringCharge> = {}): RecurringCharge {
  return {
    merchant,
    amountCents: -amountCents,
    cadence: "monthly",
    nextDate: "2026-12-04",
    accountId: "acct-1",
    category: "entertainment.streaming",
    source: "bank",
    ...overrides,
  };
}

function tx(merchant: string, date: string, amountCents: number, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `${merchant}-${date}`,
    accountId: "acct-1",
    date,
    amountCents: -amountCents,
    currency: "USD",
    originalAmountCents: null,
    exchangeRateToUsd: null,
    exchangeRateDate: null,
    merchant,
    category: null,
    subcategory: null,
    isRecurring: true,
    pending: false,
    categoryDetailed: null,
    paymentChannel: null,
    logoUrl: null,
    ...overrides,
  };
}

/** A grocery purchase early in the year, so the ledger is long enough to tell a new subscription from an old one. */
const EARLY = tx("Corner Market", "2026-01-05", 4000, { isRecurring: false });

function build(overrides: Partial<SubscriptionInput> = {}) {
  return buildSubscriptions({ charges: [], loans: [], transactions: [EARLY], monthlyIncomeCents: 500_000, today: TODAY, ...overrides });
}

const flagTypes = (s: { flags: { type: string }[] }) => s.flags.map((f) => f.type);

test("a charge is a subscription or a bill by its category, and savings and income are left out", () => {
  const built = build({
    charges: [
      charge("StreamFlix", 1549),
      charge("Fiberlink Internet", 7000, { category: "utilities.internet_cable" }),
      charge("Auto Transfer", 20_000, { category: "savings_investing.savings" }),
      charge("Mystery Co", 500, { category: null }),
    ],
  });
  const kinds = Object.fromEntries(built.map((s) => [s.merchant, s.kind]));
  assert.deepEqual(kinds, { StreamFlix: "subscription", "Fiberlink Internet": "bill", "Mystery Co": "subscription" });
});

test("cost is positive and comes from the cadence", () => {
  const [weekly, yearly] = build({
    charges: [charge("Weekly Box", 1000, { cadence: "weekly" }), charge("Annual Club", 17_999, { cadence: "yearly", nextDate: "2027-06-01" })],
  });
  assert.deepEqual([weekly!.monthlyCents, weekly!.annualCents], [4333, 52_000]);
  assert.deepEqual([yearly!.monthlyCents, yearly!.annualCents], [1500, 17_999]);
});

test("loan and card payments are bills, and a stream for the same kind of payment is dropped", () => {
  const built = build({
    loans: [charge("Condo Mortgage", 132_000, { category: "housing.mortgage", source: "bank" })],
    charges: [charge("Lakeside Home Loans", 132_000, { category: "housing.mortgage" }), charge("StreamFlix", 1549)],
  });
  assert.deepEqual(built.map((s) => [s.merchant, s.kind]).sort(), [["Condo Mortgage", "bill"], ["StreamFlix", "subscription"]]);
});

test("the same account and merchant appear once, however the stream and the ledger spell it", () => {
  const built = build({ charges: [charge("Netflix", 1549), charge("NETFLIX.COM", 1549)] });
  assert.equal(built.length, 1);
});

test("a rise in price is flagged with what it was and when it changed", () => {
  const [netflix] = build({
    charges: [charge("StreamFlix", 1549)],
    transactions: [EARLY, tx("StreamFlix", "2026-09-04", 1099), tx("StreamFlix", "2026-10-04", 1099), tx("StreamFlix", "2026-11-04", 1549)],
  });
  const flag = netflix!.flags.find((f) => f.type === "price_up");
  assert.deepEqual(flag, { type: "price_up", previousCents: 1099, changedOn: "2026-11-04", group: null });
});

test("a subscription costs its latest charge, and a bill keeps the bank's usual amount", () => {
  // The bank's amount is an average across the price change; the latest charge is what is billed now.
  const [sub, bill] = build({
    charges: [charge("StreamFlix", 1263), charge("Water", 4522, { category: "utilities.water" })],
    transactions: [EARLY, tx("StreamFlix", "2026-10-04", 1199), tx("StreamFlix", "2026-11-04", 1549), tx("Water", "2026-11-04", 4800)],
  });
  assert.deepEqual([sub!.amountCents, sub!.monthlyCents, sub!.annualCents], [-1549, 1549, 18_588]);
  assert.deepEqual([bill!.amountCents, bill!.monthlyCents], [-4522, 4522]);
});

test("history is matched whatever the bank prints, and carries only charges, oldest first", () => {
  const [sub] = build({
    charges: [charge("Netflix", 1549)],
    transactions: [
      EARLY,
      tx("NETFLIX.COM 8665", "2026-11-04", 1549),
      tx("Netflix Inc", "2026-10-04", 1549),
      tx("Netflix", "2026-10-20", 1549, { amountCents: 1549 }), // a refund
      tx("Netflix", "2026-11-18", 1549, { pending: true }),
      tx("Netflix", "2026-09-04", 1549, { accountId: "acct-2" }), // another account
    ],
  });
  assert.deepEqual(sub!.history, [
    { date: "2026-10-04", amountCents: -1549 },
    { date: "2026-11-04", amountCents: -1549 },
  ]);
  assert.equal(sub!.lastChargeDate, "2026-11-04");
});

test("two services in one group are each flagged, and a lone one is not", () => {
  const built = build({
    charges: [charge("Netflix", 1549), charge("Hulu", 1099), charge("Tunewave", 1099, { category: "entertainment.music" })],
  });
  const byName = Object.fromEntries(built.map((s) => [s.merchant, s.flags.filter((f) => f.type === "possible_duplicate")]));
  assert.deepEqual(byName.Netflix, [{ type: "possible_duplicate", previousCents: null, changedOn: null, group: "Video Streaming" }]);
  assert.deepEqual(byName.Hulu, byName.Netflix);
  assert.deepEqual(byName.Tunewave, []);
});

test("bills are not checked for duplicates", () => {
  const built = build({
    charges: [charge("Fiberlink Internet", 7000, { category: "utilities.internet_cable" }), charge("Netflix Cable Co", 6000, { category: "utilities.internet_cable" })],
  });
  assert.ok(built.every((s) => !flagTypes(s).includes("possible_duplicate")));
});

test("a recent first charge is flagged only when the ledger reaches back before it", () => {
  const recent = [tx("NewApp", "2026-10-10", 999), tx("NewApp", "2026-11-10", 999)];
  assert.ok(flagTypes(build({ charges: [charge("NewApp", 999)], transactions: [EARLY, ...recent] })[0]!).includes("started_recently"));
  assert.ok(!flagTypes(build({ charges: [charge("NewApp", 999)], transactions: recent })[0]!).includes("started_recently"));
});

test("a yearly charge due within 30 days is flagged", () => {
  const [soon, later] = build({
    charges: [
      charge("Soon Club", 9900, { cadence: "yearly", nextDate: "2026-12-05", category: "shopping.online" }),
      charge("Later Club", 9900, { cadence: "yearly", nextDate: "2027-03-05", category: "shopping.online" }),
    ],
  });
  assert.deepEqual([flagTypes(soon!), flagTypes(later!)], [["annual_coming"], []]);
});

test("a charge with no history gets no history flags and says nothing about it", () => {
  const [sub] = build({ charges: [charge("StreamFlix", 1549)], transactions: [] });
  assert.deepEqual([sub!.flags, sub!.history, sub!.lastChargeDate], [[], [], null]);
});

test("an unknown cadence has no cost and sorts last", () => {
  const built = build({ charges: [charge("Odd Box", 5000, { cadence: "unknown" }), charge("StreamFlix", 1549)] });
  const overview = overviewOf(built, 500_000);
  assert.deepEqual(overview.subscriptions.map((s) => s.merchant), ["StreamFlix", "Odd Box"]);
  assert.deepEqual(overview.subscriptionTotals, { monthlyCents: 1549, annualCents: 18_588, count: 2, unknownCadenceCount: 1 });
});

test("the overview orders by cost, totals each group, and gives the share of income", () => {
  const overview = overviewOf(
    build({
      charges: [
        charge("Small", 500),
        charge("Large", 4500, { category: "personal_care.gym" }),
        charge("Water", 4522, { category: "utilities.water" }),
      ],
    }),
    500_000,
  );
  assert.deepEqual(overview.subscriptions.map((s) => s.merchant), ["Large", "Small"]);
  assert.deepEqual(overview.bills.map((s) => s.merchant), ["Water"]);
  assert.equal(overview.subscriptionTotals.monthlyCents, 5000);
  assert.equal(overview.billTotals.monthlyCents, 4522);
  assert.equal(overview.shareOfIncome, 0.01);
  assert.equal(overviewOf(build({ charges: [charge("Small", 500)] }), null).shareOfIncome, null);
  assert.deepEqual(overview.cancelled, []);
});

test("the list leaves out history, which only the detail carries", () => {
  const built = build({ charges: [charge("StreamFlix", 1549)], transactions: [EARLY, tx("StreamFlix", "2026-11-04", 1549)] });
  assert.equal(built[0]!.history.length, 1);
  assert.ok(!("history" in overviewOf(built, null).subscriptions[0]!));
});

test("ids are stable between builds and differ between merchants", () => {
  const a = build({ charges: [charge("StreamFlix", 1549), charge("Tunewave", 1099)] });
  const b = build({ charges: [charge("StreamFlix", 1549), charge("Tunewave", 1099)] });
  assert.deepEqual(a.map((s) => s.id), b.map((s) => s.id));
  assert.notEqual(a[0]!.id, a[1]!.id);
});
