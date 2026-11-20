import assert from "node:assert/strict";
import { test } from "node:test";
import type { RecurringCharge, Transaction } from "@finvantage/contracts";
import type { SubscriptionState } from "@finvantage/data";
import { subscriptionId } from "@finvantage/math-core";
import { buildSubscriptions, ledgerStartOf, overviewOf, quarterSubscriptions, type SubscriptionInput } from "./subscriptions";

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
  return buildSubscriptions({ charges: [], loans: [], transactions: [EARLY], monthlyIncomeCents: 500_000, today: TODAY, states: [], ...overrides });
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
  assert.deepEqual(flag, { type: "price_up", previousCents: 1099, currentCents: 1549, changedOn: "2026-11-04", group: null });
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
  assert.deepEqual(byName.Netflix, [{ type: "possible_duplicate", previousCents: null, currentCents: null, changedOn: null, group: "Video Streaming" }]);
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

/* ─── What the user chose ──────────────────────────────────────────────── */

const stateFor = (c: RecurringCharge, overrides: Partial<SubscriptionState> = {}): SubscriptionState => ({
  id: subscriptionId(c.accountId, c.merchant),
  charge: c,
  status: "active",
  kind: null,
  cancelledOn: null,
  updatedAt: "2026-11-19T00:00:00.000Z",
  ...overrides,
});

test("the user's choice of group wins over the rule, in both directions", () => {
  const stream = charge("StreamFlix", 1549);
  const water = charge("Water", 4522, { category: "utilities.water" });
  const built = build({ charges: [stream, water], states: [stateFor(stream, { kind: "bill" }), stateFor(water, { kind: "subscription" })] });
  assert.deepEqual(Object.fromEntries(built.map((s) => [s.merchant, s.kind])), { StreamFlix: "bill", Water: "subscription" });
});

test("keeping a subscription mutes its flags but not its rival's, and it still counts", () => {
  const netflix = charge("Netflix", 1549);
  const hulu = charge("Hulu", 1099);
  const history = [tx("Netflix", "2026-09-04", 1099), tx("Netflix", "2026-10-04", 1549), tx("Netflix", "2026-11-04", 1549)];
  const loud = build({ charges: [netflix, hulu], transactions: [EARLY, ...history] });
  assert.deepEqual(flagTypes(loud.find((s) => s.merchant === "Netflix")!), ["price_up", "possible_duplicate"]);

  const kept = build({ charges: [netflix, hulu], transactions: [EARLY, ...history], states: [stateFor(netflix, { status: "keep" })] });
  const [keptNetflix, keptHulu] = [kept.find((s) => s.merchant === "Netflix")!, kept.find((s) => s.merchant === "Hulu")!];
  assert.deepEqual([keptNetflix.status, keptNetflix.flags], ["keep", []]);
  assert.deepEqual(flagTypes(keptHulu), ["possible_duplicate"]);
  assert.equal(overviewOf(kept, null).subscriptionTotals.count, 2);
});

test("a subscription being cancelled still counts and still shows its flags", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({ charges: [stream], states: [stateFor(stream, { status: "cancelling" })] });
  assert.equal(built[0]!.status, "cancelling");
  const overview = overviewOf(built, null);
  assert.deepEqual([overview.subscriptions.length, overview.subscriptionTotals.monthlyCents, overview.cancelled.length], [1, 1549, 0]);
});

test("a cancelled subscription whose charges stopped moves to the cancelled list and is credited with what it saved", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({
    charges: [stream],
    transactions: [EARLY, tx("StreamFlix", "2026-09-04", 1549), tx("StreamFlix", "2026-10-04", 1549)],
    states: [stateFor(stream, { status: "cancelled", cancelledOn: "2026-10-10" })],
  });
  // The last charge was 4 October. By 20 November one more would have posted (47 days, a month apart).
  assert.deepEqual([built[0]!.status, built[0]!.cancelledOn, built[0]!.flags, built[0]!.savedSoFarCents], ["cancelled", "2026-10-10", [], 1549]);
  const overview = overviewOf(built, 500_000);
  assert.deepEqual([overview.subscriptions, overview.cancelled.length], [[], 1]);
  assert.deepEqual(overview.subscriptionTotals, { monthlyCents: 0, annualCents: 0, count: 0, unknownCadenceCount: 0 });
  assert.equal(overview.savedSoFarCents, 1549);
});

test("a cancelled subscription that charges again is flagged with the date, and saves nothing yet", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({
    charges: [stream],
    transactions: [EARLY, tx("StreamFlix", "2026-09-03", 1549), tx("StreamFlix", "2026-10-03", 1549), tx("StreamFlix", "2026-11-03", 1549)],
    states: [stateFor(stream, { status: "cancelled", cancelledOn: "2026-09-10" })],
  });
  // 3 October is inside the month's grace, 3 November is not.
  assert.deepEqual(built[0]!.flags, [{ type: "still_charging", previousCents: null, currentCents: null, changedOn: "2026-11-03", group: null }]);
  assert.equal(built[0]!.savedSoFarCents, null);
  const overview = overviewOf(built, null);
  assert.equal(overview.savedSoFarCents, 0);
  // It is listed as cancelled, but it still costs $15.49 a month, so the totals still count it.
  assert.deepEqual([overview.subscriptions.length, overview.cancelled.length], [0, 1]);
  assert.deepEqual(overview.subscriptionTotals, { monthlyCents: 1549, annualCents: 18_588, count: 1, unknownCadenceCount: 0 });
});

test("a cancelled subscription stays listed from its snapshot after the bank's stream ends", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({
    charges: [], // the bank no longer reports the stream
    transactions: [EARLY, tx("StreamFlix", "2026-10-04", 1549)],
    states: [stateFor(stream, { status: "cancelled", cancelledOn: "2026-10-10" })],
  });
  assert.deepEqual([built.length, built[0]!.merchant, built[0]!.status, built[0]!.savedSoFarCents], [1, "StreamFlix", "cancelled", 1549]);
});

test("a stream that is still live is not listed twice beside its snapshot", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({ charges: [stream], states: [stateFor(stream, { status: "cancelled", cancelledOn: "2026-10-10" })] });
  assert.equal(built.length, 1);
});

test("a cancelled subscription with no charges on file counts from the day it was cancelled", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({ charges: [stream], transactions: [EARLY], states: [stateFor(stream, { status: "cancelled", cancelledOn: "2026-10-20" })] });
  assert.equal(built[0]!.savedSoFarCents, 1549); // 31 days: one charge
});

test("a cancelled subscription keeps the group the user chose", () => {
  const stream = charge("StreamFlix", 1549);
  const built = build({ charges: [], states: [stateFor(stream, { status: "cancelled", kind: "bill", cancelledOn: "2026-10-10" })] });
  assert.equal(built[0]!.kind, "bill");
});

test("a choice about a charge the bank no longer reports is ignored unless it was cancelled", () => {
  const stream = charge("StreamFlix", 1549);
  assert.deepEqual(build({ charges: [], states: [stateFor(stream, { status: "keep" })] }), []);
  assert.deepEqual(build({ charges: [], states: [stateFor(stream, { status: "cancelling" })] }), []);
});

/* ─── The quarterly report ─────────────────────────────────────────────── */

const Q3 = { start: "2026-07-01", endInclusive: "2026-09-30" };
const Q2 = { start: "2026-04-01", endInclusive: "2026-06-30" };

/** StreamFlix at $10 a month through June, then $15 a month; plus a water bill that must not count. */
function twoQuarters() {
  const stream = charge("StreamFlix", 1500);
  const water = charge("Water", 4522, { category: "utilities.water" });
  const transactions = [
    ...["04", "05", "06"].map((m) => tx("StreamFlix", `2026-${m}-04`, 1000)),
    ...["07", "08", "09"].map((m) => tx("StreamFlix", `2026-${m}-04`, 1500)),
    ...["04", "05", "06", "07", "08", "09"].map((m) => tx("Water", `2026-${m}-20`, 4500)),
    EARLY,
  ];
  return { stream, water, transactions };
}

test("a quarter's subscription spend is what posted in it, with the change from the quarter before", () => {
  const { stream, water, transactions } = twoQuarters();
  const details = build({ charges: [stream, water], transactions });
  assert.deepEqual(quarterSubscriptions(details, Q3, Q2, "2026-01-05"), {
    spendCents: 4500,
    previousSpendCents: 3000,
    changeCents: 1500,
    chargedCount: 1,
    cancelled: [],
  });
});

test("a fall in spend is a negative change", () => {
  const { stream, transactions } = twoQuarters();
  const details = build({ charges: [stream], transactions });
  assert.equal(quarterSubscriptions(details, Q2, Q3, "2026-01-05")?.changeCents, -1500);
});

test("with no ledger before the quarter, there is no previous figure and no change, not a false one", () => {
  const { stream, transactions } = twoQuarters();
  const details = build({ charges: [stream], transactions });
  const figures = quarterSubscriptions(details, Q3, Q2, "2026-05-01");
  assert.deepEqual([figures?.spendCents, figures?.previousSpendCents, figures?.changeCents], [4500, null, null]);
});

test("a quarter the ledger only partly covers has no figures at all", () => {
  const { stream, transactions } = twoQuarters();
  const details = build({ charges: [stream], transactions });
  assert.equal(quarterSubscriptions(details, Q3, Q2, "2026-07-15"), null);
  assert.equal(quarterSubscriptions(details, Q3, Q2, null), null);
});

test("with no subscriptions there is nothing to report, even when there are bills", () => {
  const { water, transactions } = twoQuarters();
  assert.equal(quarterSubscriptions(build({ charges: [water], transactions }), Q3, Q2, "2026-01-05"), null);
  assert.equal(quarterSubscriptions([], Q3, Q2, "2026-01-05"), null);
});

test("only subscriptions cancelled during the quarter are listed, and their charges still count", () => {
  const { stream, transactions } = twoQuarters();
  const tune = charge("Tunewave", 1099, { category: "entertainment.music" });
  const old = charge("Old Club", 500, { category: "shopping.online" });
  const details = build({
    charges: [stream, tune, old],
    transactions: [...transactions, tx("Tunewave", "2026-07-06", 1099), tx("Tunewave", "2026-08-06", 1099), tx("Old Club", "2026-04-09", 500)],
    states: [stateFor(tune, { status: "cancelled", cancelledOn: "2026-08-20" }), stateFor(old, { status: "cancelled", cancelledOn: "2026-06-20" })],
  });
  const figures = quarterSubscriptions(details, Q3, Q2, "2026-01-05")!;
  assert.deepEqual(figures.cancelled, [{ merchant: "Tunewave", cancelledOn: "2026-08-20", monthlyCents: 1099 }]);
  // StreamFlix and Tunewave charged this quarter; Old Club charged only in the quarter before.
  assert.deepEqual([figures.chargedCount, figures.spendCents, figures.previousSpendCents], [2, 4500 + 2198, 3000 + 500]);
});

test("the ledger starts at the earliest posted transaction, and pending ones do not count", () => {
  assert.equal(ledgerStartOf([tx("A", "2026-03-02", 1), tx("B", "2026-01-09", 1), tx("C", "2026-01-02", 1, { pending: true })]), "2026-01-09");
  assert.equal(ledgerStartOf([]), null);
});
