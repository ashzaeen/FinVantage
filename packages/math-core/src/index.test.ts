import assert from "node:assert/strict";
import { test } from "node:test";
import { debtToIncome, fixedCostRatio, liquidRunwayDays, opportunityCost } from "./index";

test("ratios handle zero income", () => {
  assert.equal(fixedCostRatio(100, 0), 0);
  assert.equal(debtToIncome(100, 0), 0);
});

test("runway is cash divided by daily burn", () => {
  assert.equal(liquidRunwayDays(300_000, 300_000), 30);
});

test("opportunity cost excludes the principal", () => {
  assert.equal(opportunityCost(10_000, 1, 0.1), 1_000);
});

// Scenario tests on a profile shaped like the demo fixture.
import type { FinancialSnapshot, Goal, GoalImpact } from "@finvantage/contracts";
import {
  checkingBalance,
  computeCopilotMetrics,
  debtPaymentPlan,
  loanPayment,
  pickHeadline,
  purchaseForSimulator,
  rankAlternatives,
  safeRentThreshold,
  spareChecking,
  spareSavings,
  splitPlan,
} from "./index";

const account = (over: Partial<FinancialSnapshot["accounts"][number]>) => ({
  id: "a",
  userId: "u",
  type: "checking" as const,
  loanKind: null,
  name: "Account",
  institution: "Demo Bank",
  balanceCents: 0,
  annualRate: null,
  minimumPaymentCents: null,
  promoRateEndsOn: null,
  subtype: null,
  mask: null,
  availableBalanceCents: null,
  creditLimitCents: null,
  nextPaymentDueOn: null,
  ...over,
});

const snapshot: FinancialSnapshot = {
  asOf: "2026-11-07",
  accounts: [
    account({ id: "chk", type: "checking", balanceCents: 340_000 }),
    account({ id: "sav", type: "savings", name: "High-Yield Savings", balanceCents: 1_850_000, annualRate: 0.04 }),
    account({ id: "promo", type: "credit_card", name: "0% Promo Card", annualRate: 0, promoRateEndsOn: "2027-09-30" }),
    account({ id: "mtg", type: "mortgage", name: "Mortgage", balanceCents: 21_500_000, minimumPaymentCents: 46_500, annualRate: 0.0625 }),
    account({ id: "card", type: "credit_card", name: "Cash Rewards Card", balanceCents: 86_000, annualRate: 0.2299, minimumPaymentCents: 3_500 }),
  ],
  monthlyIncomeCents: 620_000,
  monthlyFixedCostsCents: 260_000,
  monthlyDebtPaymentsCents: 98_000,
  monthlySpendingCents: 430_000,
  monthlySavingsCents: 120_000,
  nextPaydayOn: "2026-11-15",
  bufferTargetCents: 250_000,
};

// Goals that use all of the sample savings ($18,500), so only spare checking is spare.
const emergency: Goal = {
  id: "g1",
  userId: "u",
  name: "Emergency fund",
  targetCents: 1_800_000,
  currentCents: 1_200_000,
  targetDate: "2027-12-01",
  priorityRank: 1,
  flexibility: "non_negotiable",
  linkedAccountId: null,
};

// Goals that use all of the sample savings ($18,500), so only spare checking is spare.
const savingsAllUsed: Goal[] = [{ ...emergency, currentCents: 1_850_000 }];

const impact = (over: Partial<GoalImpact>): GoalImpact => ({
  goalId: "g",
  goalName: "Goal",
  probabilityLowDelta: 0,
  probabilityHighDelta: 0,
  probabilityLowAfter: 0.5,
  probabilityHighAfter: 0.6,
  delayMonths: 0,
  ...over,
});

test("rent replaces the current housing payment", () => {
  const p = purchaseForSimulator(snapshot, { pageType: "rental", itemType: "rent_monthly", priceCents: 195_000, merchant: "x" }, savingsAllUsed);
  assert.deepEqual(p, { amountCents: 0, monthlyCents: 195_000 - 46_500 });
});

test("safe rent keeps non-negotiable goals on schedule, rounded down to $50", () => {
  // 13 months to Dec 2027: needs 600,000 / 13 = 46,154 a month. Slack 73,846 + housing 46,500.
  assert.equal(safeRentThreshold(snapshot, [emergency]), 120_000);
});

test("split plan pays checking down to the buffer and clears the promo card in time", () => {
  const plan = splitPlan(snapshot, 149_900, savingsAllUsed)!;
  assert.equal(plan.fromCheckingCents, 90_000);
  assert.equal(plan.onPromoCardCents, 59_900);
  assert.equal(plan.monthlyPaymentCents, 6_000);
  assert.ok(plan.payoffMonths <= 10);
});

test("no split plan when checking covers it above the buffer", () => {
  assert.equal(splitPlan(snapshot, 50_000, savingsAllUsed), null);
});

test("vehicle financing includes interest", () => {
  assert.ok(loanPayment(2_800_000, 0.07, 60) > 2_800_000 / 60);
  const m = computeCopilotMetrics(snapshot, { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 2_800_000, merchant: "x" }, [], savingsAllUsed);
  assert.ok(m.totalCostOfOwnershipCents! > 2_800_000);
  assert.ok(m.debtToIncomeAfter! > m.debtToIncomeBefore!);
});

test("fields that do not apply are null", () => {
  const m = computeCopilotMetrics(snapshot, { pageType: "checkout", itemType: "retail_purchase", priceCents: 149_900, merchant: "x" }, [], savingsAllUsed);
  assert.equal(m.safeRentThresholdCents, null);
  assert.equal(m.vehicle, null);
  assert.equal(m.fixedCostRatioBefore, null);
});

test("headline prefers a big odds drop over a small delay", () => {
  const h = pickHeadline([
    impact({ goalName: "House", delayMonths: 0.8, probabilityLowDelta: -0.05, probabilityHighDelta: -0.04 }),
    impact({ goalName: "Japan trip", delayMonths: 0, probabilityLowDelta: -0.17, probabilityHighDelta: -0.18, probabilityLowAfter: 0.76, probabilityHighAfter: 0.76 }),
  ]);
  assert.equal(h.kind, "odds");
  assert.equal(h.goalName, "Japan trip");
});

test("headline is none when nothing moves", () => {
  assert.equal(pickHeadline([impact({ delayMonths: 0.1, probabilityLowDelta: -0.01 })]).kind, "none");
});

test("headline flags a goal that stops being reachable", () => {
  const h = pickHeadline([impact({ goalName: "House", delayMonths: null, probabilityLowDelta: -0.4, probabilityHighDelta: -0.5, probabilityLowAfter: 0, probabilityHighAfter: 0.05 })]);
  assert.equal(h.kind, "out_of_reach");
});

test("a goal that was already out of reach does not headline over one that moved", () => {
  const h = pickHeadline([
    impact({ goalName: "House", delayMonths: 19.7, probabilityLowDelta: -0.25, probabilityHighDelta: -0.5 }),
    impact({ goalName: "Next car", delayMonths: 24, probabilityLowAfter: 0, probabilityHighAfter: 0 }),
  ]);
  assert.equal(h.goalName, "House");
});


const cardPayment = { pageType: "debt_payment", itemType: "credit_card_payment", priceCents: 86_000, merchant: "x" } as const;

test("a card payment targets the highest-rate card and values the interest saved", () => {
  const plan = debtPaymentPlan(snapshot, 86_000)!;
  assert.equal(plan.accountName, "Cash Rewards Card");
  assert.equal(plan.paysOffInFull, true);
  assert.equal(plan.annualInterestSavedCents, 19_800);
  assert.equal(plan.freedMonthlyCents, 3_500);
  assert.equal(plan.checkingAfterCents, 340_000 - 86_000);
});

test("a partial card payment frees no minimum and leaves a remainder", () => {
  const plan = debtPaymentPlan(snapshot, 30_000)!;
  assert.equal(plan.paysOffInFull, false);
  assert.equal(plan.freedMonthlyCents, 0);
  assert.equal(plan.remainingCents, 56_000);
});

test("a minimum-only payment is a nudge, not a good move", () => {
  const plan = debtPaymentPlan(snapshot, 3_500)!;
  assert.equal(plan.isMinimumOnly, true);
  assert.equal(plan.canPayInFull, true);
  assert.equal(plan.remainingAnnualInterestCents, 19_000);
  const m = computeCopilotMetrics(snapshot, { ...cardPayment, priceCents: 3_500 }, [], savingsAllUsed);
  assert.equal(m.verdict, "neutral");
});

test("paying more than the balance only counts the balance", () => {
  assert.equal(debtPaymentPlan(snapshot, 200_000)!.paidCents, 86_000);
});

test("the simulator sees money back each month, and only the cash beyond spare checking", () => {
  // $3,400 checking - $2,500 cushion = $900 spare covers the $860 payment: no goal savings used.
  assert.deepEqual(purchaseForSimulator(snapshot, cardPayment, savingsAllUsed), { amountCents: 0, monthlyCents: -3_500 });
  const tight = { ...snapshot, bufferTargetCents: 300_000 }; // $400 spare
  assert.deepEqual(purchaseForSimulator(tight, cardPayment, savingsAllUsed), { amountCents: 46_000, monthlyCents: -3_500 });
});

test("a purchase spends spare checking first; only the rest reaches goal savings", () => {
  const laptop = { pageType: "checkout" as const, itemType: "retail_purchase" as const, priceCents: 149_900, merchant: "x" };
  assert.deepEqual(purchaseForSimulator(snapshot, laptop, savingsAllUsed), { amountCents: 59_900, monthlyCents: 0 });
  const flush = { ...snapshot, accounts: snapshot.accounts.map((a) => (a.type === "checking" ? { ...a, balanceCents: 1_500_000 } : a)) };
  assert.deepEqual(purchaseForSimulator(flush, laptop, savingsAllUsed), { amountCents: 0, monthlyCents: 0 });
});

test("spendable checking uses the bank's available balance when it reports one", () => {
  const pending = { ...snapshot, accounts: snapshot.accounts.map((a) => (a.type === "checking" ? { ...a, availableBalanceCents: 300_000 } : a)) };
  assert.equal(checkingBalance(pending), 300_000);
  assert.equal(spareChecking(pending), 50_000);
});

test("the 0% split is offered only if it fits the card's credit and the monthly budget", () => {
  const promoWith = (over: object) => ({ ...snapshot, accounts: snapshot.accounts.map((a) => (a.annualRate === 0 && a.type === "credit_card" ? { ...a, ...over } : a)) });
  assert.ok(splitPlan(snapshot, 149_900, savingsAllUsed), "baseline: the split works");
  assert.equal(splitPlan(promoWith({ availableBalanceCents: 50_000 }), 149_900, savingsAllUsed), null, "$500 of credit can't take $599");
  assert.ok(splitPlan(promoWith({ availableBalanceCents: 60_000 }), 149_900, savingsAllUsed), "$600 of credit can");
  assert.equal(splitPlan({ ...snapshot, monthlySavingsCents: 5_000 }, 149_900, savingsAllUsed), null, "a payment above monthly savings isn't a plan");
});

test("alternatives rank the 23% card above investing above savings", () => {
  const labels = rankAlternatives(snapshot).map((a) => a.label);
  assert.deepEqual(labels, ["Cash Rewards Card", "Investing", "Mortgage", "High-Yield Savings"]);
});

test("paying off a high-rate card is a good move", () => {
  const m = computeCopilotMetrics(snapshot, cardPayment, [], savingsAllUsed);
  assert.equal(m.verdict, "good");
  assert.equal(m.liquidBufferAfterCents, null);
});

test("an affordable checkout is good; one that breaks the cushion is caution", () => {
  const small = computeCopilotMetrics(snapshot, { pageType: "checkout", itemType: "retail_purchase", priceCents: 12_900, merchant: "x" }, [], savingsAllUsed);
  const big = computeCopilotMetrics(snapshot, { pageType: "checkout", itemType: "retail_purchase", priceCents: 149_900, merchant: "x" }, [], savingsAllUsed);
  assert.equal(small.verdict, "good");
  assert.equal(big.verdict, "caution");
});

test("a goal that gets more likely is a gain headline when nothing got worse", () => {
  const h = pickHeadline([impact({ goalName: "House", delayMonths: 0, probabilityLowDelta: 0.05, probabilityHighDelta: 0.04 })]);
  assert.equal(h.kind, "gain");
  assert.equal(h.goalName, "House");
});

test("a loss outranks a gain", () => {
  const h = pickHeadline([
    impact({ goalName: "House", probabilityLowDelta: 0.05, probabilityHighDelta: 0.05 }),
    impact({ goalName: "Trip", probabilityLowDelta: -0.1, probabilityHighDelta: -0.1 }),
  ]);
  assert.equal(h.goalName, "Trip");
});

test("goal status turns a likelihood range into a plain word", async () => {
  const { goalStatus } = await import("./index");
  assert.equal(goalStatus(0.93, 0.94), "on track");
  assert.equal(goalStatus(0.82, 0.86), "likely");
  assert.equal(goalStatus(0.76, 0.76), "at risk");
  assert.equal(goalStatus(0.25, 0.51), "unlikely");
  assert.equal(goalStatus(0, 0.05), "out of reach");
});

// A bank-linked person like Plaid Sandbox's: little in checking, a lot in savings no goal uses.
const savingsRich: FinancialSnapshot = {
  ...snapshot,
  accounts: [
    account({ id: "chk", type: "checking", balanceCents: 11_000, availableBalanceCents: 10_000 }),
    account({ id: "mm", type: "savings", subtype: "money market", name: "Plaid Money Market", balanceCents: 4_320_000 }),
    account({ id: "hsa", type: "savings", subtype: "hsa", name: "Plaid HSA", balanceCents: 600_900 }),
    account({ id: "card", type: "credit_card", name: "Plaid Credit Card", balanceCents: 41_000, annualRate: 0.125, minimumPaymentCents: 2_000 }),
  ],
};
const laptop = { pageType: "checkout" as const, itemType: "retail_purchase" as const, priceCents: 149_900, merchant: "x" };

test("savings no goal uses count as spare; an HSA and goal savings don't", () => {
  assert.equal(spareSavings(savingsRich, [emergency]), 4_320_000 - 1_200_000, "money market minus the goal's savings, no HSA");
  assert.equal(spareSavings(snapshot, savingsAllUsed), 0);
});

test("checking can't cover it but spare savings can: move money in first, and it's good", () => {
  const m = computeCopilotMetrics(savingsRich, laptop, [], [emergency]);
  // $100 available - $1,499 = -$1,399. Checking was already under the cushion, so just cover it.
  assert.deepEqual(m.transfer, { fromAccountName: "Plaid Money Market", amountCents: 139_900 });
  assert.equal(m.splitPlan, null, "savings beat borrowing, even at 0%");
  assert.equal(m.verdict, "good");
  assert.deepEqual(purchaseForSimulator(savingsRich, laptop, [emergency]), { amountCents: 0, monthlyCents: 0 });
});

test("the demo-like profile, whose goals use all its savings, gets no transfer", () => {
  const m = computeCopilotMetrics(snapshot, laptop, [], savingsAllUsed);
  assert.equal(m.transfer, null);
  assert.ok(m.splitPlan, "the 0% split still applies");
  assert.equal(m.verdict, "caution");
});

test("a card payment bigger than checking suggests moving spare savings in first", () => {
  const payment = { pageType: "debt_payment" as const, itemType: "credit_card_payment" as const, priceCents: 41_000, merchant: "x" };
  const m = computeCopilotMetrics(savingsRich, payment, [], [emergency]);
  assert.equal(m.transfer?.fromAccountName, "Plaid Money Market");
  assert.equal(m.transfer?.amountCents, 31_000, "$100 - $410 = -$310: cover the $310");
});

test("checking already under the cushion: a small purchase it covers is fine, with no transfer", () => {
  // The $12.99 extension cord on Amazon, 2026-11-08: $100 in checking, $2,500 cushion.
  const cord = { ...laptop, priceCents: 1_299 };
  const m = computeCopilotMetrics(savingsRich, cord, [], [emergency]);
  assert.equal(m.transfer, null, "not 'move $2,413' for a $13 cord");
  assert.equal(m.verdict, "good");
});

test("a purchase that drops checking below the cushion still restores it", () => {
  const flush = { ...savingsRich, accounts: savingsRich.accounts.map((a) => (a.type === "checking" ? { ...a, availableBalanceCents: 300_000 } : a)) };
  const m = computeCopilotMetrics(flush, laptop, [], [emergency]);
  // $3,000 - $1,499 = $1,501, which is $999 under the cushion it was above.
  assert.deepEqual(m.transfer, { fromAccountName: "Plaid Money Market", amountCents: 99_900 });
  assert.equal(m.verdict, "good", "the transfer keeps the cushion");
});

