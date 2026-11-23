import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubscriptionCharge } from "@finvantage/contracts";
import {
  annualComing,
  billingChannel,
  annualCostCents,
  cancelGraceDays,
  classifyKind,
  duplicateGroups,
  flaggedAnnualCents,
  monthlyCostCents,
  normalizeMerchant,
  priceChange,
  priceHistory,
  savedSoFarCents,
  shareOfIncome,
  startedRecently,
  stillCharging,
  subscriptionGroup,
  subscriptionId,
  sumCosts,
} from "./subscriptions";

const TODAY = "2026-11-19";

/** Charges as `[date, dollars-in-cents]` pairs; a positive number is paid out, a negative one is a refund. */
const charges = (...rows: [string, number][]): SubscriptionCharge[] =>
  rows.map(([date, cents]) => ({ date, amountCents: -cents }));

/* ─── Cost ─────────────────────────────────────────────────────────────── */

test("each cadence becomes a yearly and a monthly cost, rounded once at the cent", () => {
  assert.equal(annualCostCents(-1499, "monthly"), 17_988);
  assert.equal(monthlyCostCents(-1499, "monthly"), 1499);
  assert.equal(annualCostCents(-1000, "weekly"), 52_000);
  assert.equal(monthlyCostCents(-1000, "weekly"), 4333); // 4333.33
  assert.equal(annualCostCents(-1000, "biweekly"), 26_000);
  assert.equal(monthlyCostCents(-1000, "biweekly"), 2167); // 2166.67
  assert.equal(annualCostCents(-5000, "semi_monthly"), 120_000);
  assert.equal(monthlyCostCents(-5000, "semi_monthly"), 10_000);
  assert.equal(annualCostCents(-17_999, "yearly"), 17_999);
  assert.equal(monthlyCostCents(-17_999, "yearly"), 1500); // 1499.92
});

test("an unknown cadence has no cost, and a positive amount reads the same as a negative one", () => {
  assert.equal(annualCostCents(-1499, "unknown"), null);
  assert.equal(monthlyCostCents(-1499, "unknown"), null);
  assert.equal(monthlyCostCents(1499, "monthly"), 1499);
});

test("totals leave out cancelled charges, count unknown cadences without guessing, and add exact yearly costs", () => {
  const totals = sumCosts([
    { monthlyCents: 1499, annualCents: 17_988, status: "active" },
    { monthlyCents: 1500, annualCents: 17_999, status: "keep" },
    { monthlyCents: 999, annualCents: 11_988, status: "cancelled" },
    { monthlyCents: null, annualCents: null, status: "cancelling" },
  ]);
  assert.deepEqual(totals, { monthlyCents: 2999, annualCents: 35_987, count: 3, unknownCadenceCount: 1 });
});

test("totals of nothing are zero", () => {
  assert.deepEqual(sumCosts([]), { monthlyCents: 0, annualCents: 0, count: 0, unknownCadenceCount: 0 });
});

test("share of income is a decimal fraction, and null without income", () => {
  assert.equal(shareOfIncome(15_000, 500_000), 0.03);
  assert.equal(shareOfIncome(15_000, null), null);
  assert.equal(shareOfIncome(15_000, 0), null);
});

/* ─── Identity ─────────────────────────────────────────────────────────── */

test("the same merchant reduces to the same name however the bank prints it", () => {
  for (const raw of ["NETFLIX.COM", "Netflix 8665", "NETFLIX INC", "netflix", "NETFLIX.COM 8665", "  Netflix  "]) {
    assert.equal(normalizeMerchant(raw), "netflix", raw);
  }
});

test("merchant names lose card-reader prefixes, references after a star, and store numbers", () => {
  assert.equal(normalizeMerchant("SQ *BLUE BOTTLE COFFEE"), "blue bottle coffee");
  assert.equal(normalizeMerchant("TST* Corner Cafe"), "corner cafe");
  assert.equal(normalizeMerchant("AMZN Mktp US*2K4HG93"), "amzn mktp us");
  assert.equal(normalizeMerchant("7-Eleven 12345"), "7 eleven");
  assert.equal(normalizeMerchant("Acme Holdings LLC"), "acme holdings");
});

test("odd merchant names still give something, and different merchants stay different", () => {
  assert.equal(normalizeMerchant("1Password"), "1password");
  assert.equal(normalizeMerchant("Inc"), "inc");
  assert.equal(normalizeMerchant("***"), "***");
  assert.notEqual(normalizeMerchant("Hulu"), normalizeMerchant("Hula Hoop"));
});

test("an id holds across spellings and syncs, and changes with the account or the merchant", () => {
  const id = subscriptionId("acct-1", "NETFLIX.COM");
  assert.equal(subscriptionId("acct-1", "Netflix 8665"), id);
  assert.equal(subscriptionId("acct-1", "Netflix Inc"), id);
  assert.notEqual(subscriptionId("acct-2", "Netflix"), id);
  assert.notEqual(subscriptionId("acct-1", "Hulu"), id);
  assert.match(id, /^sub_[0-9a-z]+$/);
});

/* ─── Subscription or bill ─────────────────────────────────────────────── */

test("needs and loan payments are bills", () => {
  for (const category of ["housing.rent", "utilities.phone", "utilities.internet_cable", "insurance.insurance", "debt_payments.car", "health.dental"]) {
    assert.equal(classifyKind({ category }), "bill", category);
  }
  assert.equal(classifyKind({ category: "transfers.credit_card_payment" }), "bill");
  assert.equal(classifyKind({ category: "transfer" }), "bill"); // an id from before the category redesign
  assert.equal(classifyKind({ category: "entertainment.streaming", isLiabilityPayment: true }), "bill");
});

test("wants and unplaced charges are subscriptions", () => {
  for (const category of ["entertainment.streaming", "personal_care.gym", "shopping.online", "unknown", "subscriptions", null]) {
    assert.equal(classifyKind({ category }), "subscription", String(category));
  }
});

test("saving, investing and income are neither", () => {
  for (const category of ["savings_investing.savings", "savings_investing.investments", "income.paycheck"]) {
    assert.equal(classifyKind({ category }), null, category);
  }
});

test("the user's choice wins over every rule", () => {
  assert.equal(classifyKind({ category: "entertainment.streaming", override: "bill" }), "bill");
  assert.equal(classifyKind({ category: "housing.rent", override: "subscription" }), "subscription");
  assert.equal(classifyKind({ category: "income.paycheck", override: "subscription" }), "subscription");
});

/* ─── Duplicates ───────────────────────────────────────────────────────── */

test("a listed merchant gets its group, and its name wins over its category", () => {
  assert.equal(subscriptionGroup("NETFLIX.COM", null), "Video Streaming");
  assert.equal(subscriptionGroup("HBO Max", null), "Video Streaming");
  assert.equal(subscriptionGroup("Amazon Prime Video", null), "Video Streaming");
  assert.equal(subscriptionGroup("Spotify USA", "entertainment.streaming"), "Music Streaming");
  assert.equal(subscriptionGroup("Google One", null), "Cloud Storage");
  assert.equal(subscriptionGroup("WSJ", null), "News");
});

test("an unlisted merchant takes its group from its category, and most have none", () => {
  assert.equal(subscriptionGroup("Mystery Stream", "entertainment.streaming"), "Video Streaming");
  assert.equal(subscriptionGroup("Corner Gym", "personal_care.gym"), "Gym & Fitness");
  assert.equal(subscriptionGroup("Hulaween Tickets", null), null);
  assert.equal(subscriptionGroup("Acme Software", "shopping.online"), null);
});

test("only a group with two or more subscriptions is flagged", () => {
  const found = duplicateGroups([
    { id: "a", merchant: "Netflix", category: "entertainment.streaming" },
    { id: "b", merchant: "Hulu", category: "entertainment.streaming" },
    { id: "c", merchant: "Spotify", category: "entertainment.music" },
    { id: "d", merchant: "Mystery Stream", category: "entertainment.streaming" },
    { id: "e", merchant: "Corner Gym", category: "personal_care.gym" },
  ]);
  assert.deepEqual([...found.entries()].sort(), [
    ["a", "Video Streaming"],
    ["b", "Video Streaming"],
    ["d", "Video Streaming"],
  ]);
  assert.equal(duplicateGroups([]).size, 0);
});

/* ─── Price changes ────────────────────────────────────────────────────── */

test("a step up between two charges is a price change, with the first charge at the new price", () => {
  const change = priceChange(
    charges(["2026-08-03", 6200], ["2026-09-03", 6200], ["2026-10-03", 7900], ["2026-11-03", 7900]),
    TODAY,
  );
  assert.deepEqual(change, { previousCents: 6200, currentCents: 7900, changedOn: "2026-10-03" });
});

test("the rise threshold is the larger of $1 or 2% of the old price, inclusive", () => {
  const rise = (from: number, to: number) => priceChange(charges(["2026-10-03", from], ["2026-11-03", to]), TODAY);
  assert.equal(rise(1000, 1050), null); // 50 cents: under $1
  assert.notEqual(rise(999, 1099), null); // exactly $1
  assert.equal(rise(999, 1098), null);
  assert.notEqual(rise(10_000, 10_200), null); // exactly 2%
  assert.equal(rise(10_000, 10_199), null);
});

test("a price that held, fell, or rose and then fell back is not a change", () => {
  assert.equal(priceChange(charges(["2026-10-03", 1500], ["2026-11-03", 1500]), TODAY), null);
  assert.equal(priceChange(charges(["2026-10-03", 1500], ["2026-11-03", 1000]), TODAY), null);
  assert.equal(priceChange(charges(["2026-09-03", 1000], ["2026-10-03", 1500], ["2026-11-03", 1000]), TODAY), null);
});

test("refunds do not count as charges", () => {
  const history = charges(["2026-09-03", 6200], ["2026-10-03", 6200], ["2026-10-20", -6200], ["2026-11-03", 6200]);
  assert.equal(priceChange(history, TODAY), null);
});

test("no history, or a single charge, is no change", () => {
  assert.equal(priceChange([], TODAY), null);
  assert.equal(priceChange(charges(["2026-11-03", 1500]), TODAY), null);
});

test("an old rise stops being shown after the window", () => {
  const history = charges(["2026-02-03", 1000], ["2026-03-03", 1500], ["2026-10-03", 1500], ["2026-11-03", 1500]);
  assert.equal(priceChange(history, TODAY), null);
  // The same step is shown while it is inside the window.
  assert.notEqual(priceChange(charges(["2026-06-03", 1000], ["2026-07-24", 1500], ["2026-11-03", 1500]), TODAY), null);
});

test("many small rises that add up against last year's charge are a price change", () => {
  const history = charges(
    ["2025-11-05", 1000],
    ["2026-02-05", 1050],
    ["2026-08-05", 1080],
    ["2026-09-05", 1090],
    ["2026-10-05", 1100],
    ["2026-11-05", 1105],
  );
  assert.deepEqual(priceChange(history, TODAY), { previousCents: 1000, currentCents: 1105, changedOn: "2026-10-05" });
});

/* ─── Started recently, still charging, annual ─────────────────────────── */

test("a first charge in the last 60 days is a recent start, if the ledger reaches back far enough", () => {
  const first = charges(["2026-10-10", 1499], ["2026-11-10", 1499]);
  assert.equal(startedRecently(first, "2026-01-01", TODAY), true);
  assert.equal(startedRecently(first, "2026-10-01", TODAY), false); // the ledger starts too close to say
  assert.equal(startedRecently(first, null, TODAY), false);
  assert.equal(startedRecently(charges(["2026-02-10", 1499], ["2026-11-10", 1499]), "2026-01-01", TODAY), false);
  assert.equal(startedRecently([], "2026-01-01", TODAY), false);
});

test("a recent start is judged on the first charge, not on refunds", () => {
  const history = charges(["2026-10-10", -500], ["2026-02-10", 1499], ["2026-11-10", 1499]);
  assert.equal(startedRecently(history, "2026-01-01", TODAY), false);
});

test("grace after a cancellation is a cadence, capped at 35 days", () => {
  assert.equal(cancelGraceDays("weekly"), 7);
  assert.equal(cancelGraceDays("biweekly"), 14);
  assert.equal(cancelGraceDays("semi_monthly"), 16);
  assert.equal(cancelGraceDays("monthly"), 31);
  assert.equal(cancelGraceDays("yearly"), 35);
  assert.equal(cancelGraceDays("unknown"), 35);
});

test("a charge just inside the grace window is the last bill; one just outside is still charging", () => {
  // Cancelled 2026-09-10, monthly: the window ends 2026-10-11.
  const inside = charges(["2026-09-03", 1499], ["2026-10-11", 1499]);
  const outside = charges(["2026-09-03", 1499], ["2026-10-12", 1499], ["2026-11-12", 1499]);
  assert.equal(stillCharging("2026-09-10", "monthly", inside), null);
  assert.deepEqual(stillCharging("2026-09-10", "monthly", outside), { date: "2026-10-12", amountCents: -1499 });
});

test("a refund after cancelling is not a charge", () => {
  assert.equal(stillCharging("2026-09-10", "monthly", charges(["2026-10-20", -1499])), null);
  assert.equal(stillCharging("2026-09-10", "monthly", []), null);
});

test("a yearly charge is flagged only in the 30 days before it", () => {
  assert.equal(annualComing("yearly", "2026-12-19", TODAY), true);
  assert.equal(annualComing("yearly", "2026-11-19", TODAY), true);
  assert.equal(annualComing("yearly", "2026-12-20", TODAY), false);
  assert.equal(annualComing("yearly", "2026-11-18", TODAY), false);
  assert.equal(annualComing("monthly", "2026-11-25", TODAY), false);
});

/* ─── Saved so far ─────────────────────────────────────────────────────── */

test("saved so far counts the whole charges that would have posted since the last one", () => {
  assert.equal(savedSoFarCents(-1499, "monthly", "2026-08-05", TODAY), 4497); // 106 days: three charges
  assert.equal(savedSoFarCents(-999, "weekly", "2026-11-01", TODAY), 1998); // 18 days: two charges
  assert.equal(savedSoFarCents(-17_999, "yearly", "2025-12-01", TODAY), 0); // under a year
  assert.equal(savedSoFarCents(-1499, "unknown", "2026-08-05", TODAY), 0);
  assert.equal(savedSoFarCents(-1499, "monthly", "2026-12-01", TODAY), 0); // a charge dated after today
});

/* ─── Billing channel ──────────────────────────────────────────────────── */

test("a charge through Apple, Google Play or PayPal is cancelled there", () => {
  for (const raw of ["APPLE.COM/BILL", "Apple Music", "Apple TV+", "ITUNES.COM/BILL", "App Store Purchase"]) assert.equal(billingChannel(raw), "apple", raw);
  for (const raw of ["GOOGLE *YouTube Premium", "Google Play", "GOOGLEPLAY"]) assert.equal(billingChannel(raw), "google_play", raw);
  for (const raw of ["PAYPAL *HULU", "Paypal"]) assert.equal(billingChannel(raw), "paypal", raw);
});

test("anything else is billed directly, including names that only look like a store", () => {
  for (const raw of ["Netflix", "Google One", "Applebee's", "Pineapple Fitness", "Amazon Prime", "StreamFlix", ""]) assert.equal(billingChannel(raw), "direct", raw);
});

test("a price line draws the last charges as positive amounts, oldest first, and skips refunds", () => {
  const charge = (date: string, amountCents: number) => ({ date, amountCents });
  const history = [charge("2026-08-03", -1199), charge("2026-09-03", -1199), charge("2026-09-20", 500), charge("2026-10-03", -1549), charge("2026-11-03", -1549)];
  assert.deepEqual(priceHistory(history), [1199, 1199, 1549, 1549]);
  assert.deepEqual(priceHistory(history, 2), [1549, 1549]);
  assert.deepEqual(priceHistory([]), []);
});

test("flagged annual cost counts only subscriptions with a flag worth acting on", () => {
  const row = (kind: "subscription" | "bill", annualCents: number | null, flags: string[], status = "active") => ({ kind, status, annualCents, flags: flags.map((type) => ({ type })) });
  assert.equal(
    flaggedAnnualCents([
      row("subscription", 18_588, ["price_up"]),
      row("subscription", 11_988, ["possible_duplicate", "started_recently"]), // counted once
      row("subscription", 9_999, ["annual_coming"]),
      row("subscription", 5_000, []), // no flag
      row("bill", 121_572, ["price_up"]), // a bill cannot just be dropped
      row("subscription", 7_000, ["price_up"], "cancelled"), // already cancelled
      row("subscription", null, ["price_up"]), // unknown cadence
      row("subscription", 4_000, ["still_charging"]), // a different problem
    ]),
    18_588 + 11_988 + 9_999,
  );
});
