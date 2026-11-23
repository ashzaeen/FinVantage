import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account } from "@finvantage/contracts";
import {
  allocationDrift,
  attentionItems,
  budgetSuggestions,
  copilotImpact,
  creditWhatIf,
  debtPayoff,
  goalAllocation,
  goalFunding,
  moneyCalendar,
  healthScore,
  incomeVariability,
  payoffPlan,
  safeToSpend,
  spendingPace,
  unusualCharges,
} from "./planning";
import { paydaysAhead } from "./insights";

const account = (over: Partial<Account> & Pick<Account, "id" | "type" | "balanceCents">): Account => ({
  userId: "u", loanKind: null, name: over.id, institution: "Demo Bank", annualRate: null, minimumPaymentCents: null, promoRateEndsOn: null,
  subtype: null, mask: null, availableBalanceCents: null, creditLimitCents: null, nextPaymentDueOn: null, ...over,
});

test("safe to spend is cash, plus income still due, minus bills still due and the savings still owed", () => {
  const s = safeToSpend({
    asOf: "2026-12-03",
    checkingCents: 340_000,
    expectedIncomeCents: 570_000,
    receivedIncomeCents: 293_091,
    bills: [
      { nextDate: "2026-12-02", cents: 9_999 }, // already past
      { nextDate: "2026-12-03", cents: 1_500 }, // due today still counts
      { nextDate: "2026-12-31", cents: 4_000 },
      { nextDate: "2027-01-01", cents: 132_000 }, // next month
    ],
    savingsShare: 0.2,
    savedCents: 14_000,
  });
  assert.equal(s.periodEnd, "2026-12-31");
  assert.deepEqual(s.parts, { checkingCents: 340_000, incomeStillDueCents: 276_909, billsStillDueCents: 5_500, savingsStillNeededCents: 100_000 });
  assert.equal(s.safeCents, 340_000 + 276_909 - 5_500 - 100_000);
});

test("safe to spend can go negative, and income that has all arrived is not counted twice", () => {
  const s = safeToSpend({ asOf: "2026-11-30", checkingCents: 10_000, expectedIncomeCents: 500_000, receivedIncomeCents: 650_000, bills: [{ nextDate: "2026-11-30", cents: 50_000 }], savingsShare: 0.2, savedCents: 200_000 });
  assert.equal(s.parts.incomeStillDueCents, 0);
  assert.equal(s.parts.savingsStillNeededCents, 0);
  assert.equal(s.safeCents, -40_000);
});

const NO_CARDS: never[] = [];
test("attention puts what needs doing before what is worth knowing, then ranks by urgency, and caps the list", () => {
  const items = attentionItems({
    asOf: "2026-12-03",
    cards: [
      { id: "promo", name: "0% Promo Card", nextPaymentDueOn: "2026-12-28", daysUntilDue: 25, promoRateEndsOn: "2027-01-20", promoDaysLeft: 48 },
      { id: "late", name: "Late Card", nextPaymentDueOn: "2026-12-01", daysUntilDue: -2, promoRateEndsOn: null, promoDaysLeft: null },
    ],
    budgets: [
      { category: "groceries", label: "Groceries", status: "over", remainingCents: -6_211, projectedCents: 87_444, limitCents: 55_000 },
      { category: "utilities", label: "Utilities", status: "at_risk", remainingCents: 5_026, projectedCents: 38_534, limitCents: 32_000 },
    ],
    charges: [
      { id: "gym", merchant: "Peak Fitness", amountCents: -4_500, nextDate: "2026-12-04", kind: "subscription", status: "active" },
      { id: "far", merchant: "Fiberlink", amountCents: -7_000, nextDate: "2026-12-22", kind: "bill", status: "active" },
      { id: "gone", merchant: "Old Gym", amountCents: -2_000, nextDate: "2026-12-04", kind: "subscription", status: "cancelled" },
    ],
    subscriptions: [
      { id: "sf", merchant: "StreamFlix", flags: [{ type: "price_up", previousCents: 1_199, currentCents: 1_549, group: null }, { type: "possible_duplicate", previousCents: null, currentCents: null, group: "Video Streaming" }] },
    ],
  });
  assert.deepEqual(items.map((i) => i.kind), ["card_past_due", "budget_over", "bill_due_soon", "promo_ending", "budget_at_risk"]);
  assert.equal(items.length, 5, "the feed stops at five, so the price rise and the duplicate are left off");
  assert.equal(items[0]!.message, "Late Card looks past due: the payment was due Dec 1.");
  assert.equal(items[1]!.message, "Groceries is $62.11 over its $550 limit this month.");
  assert.equal(items[2]!.message, "Peak Fitness ($45) is due Dec 4, tomorrow.");
  assert.equal(items[3]!.message, "0% Promo Card's 0% rate ends Jan 20, in 48 days.");
  assert.ok(items.every((i) => i.severity === "action" || ["promo_ending", "budget_at_risk"].includes(i.kind)));
  assert.deepEqual(attentionItems({ asOf: "2026-12-03", cards: NO_CARDS, budgets: [], charges: [], subscriptions: [] }), []);
});

test("goal funding is what is left over the months left, rounded up, and flags a date that has passed", () => {
  const medians = new Map([["a", "2028-03-01"]]);
  const f = goalFunding({
    asOf: "2026-11-23",
    goals: [
      { id: "a", name: "Trip", targetCents: 1_000_000, currentCents: 400_000, targetDate: "2027-11-23" },
      { id: "b", name: "Late", targetCents: 100_000, currentCents: 10_000, targetDate: "2026-10-01" },
      { id: "c", name: "Done", targetCents: 100_000, currentCents: 100_000, targetDate: "2030-01-01" },
      { id: "d", name: "Odd", targetCents: 100_000, currentCents: 0, targetDate: "2027-02-23" },
    ],
    medianCompletionDates: medians,
    monthlySavingsCents: 172_009,
  });
  const by = new Map(f.goals.map((g) => [g.goalId, g]));
  assert.deepEqual([by.get("a")!.monthsLeft, by.get("a")!.neededPerMonthCents, by.get("a")!.medianCompletionDate], [12, 50_000, "2028-03-01"]);
  assert.deepEqual([by.get("b")!.pastDue, by.get("b")!.monthsLeft, by.get("b")!.neededPerMonthCents], [true, 1, 90_000]);
  assert.deepEqual([by.get("c")!.neededPerMonthCents, by.get("c")!.pastDue], [0, false]);
  assert.equal(by.get("d")!.neededPerMonthCents, Math.ceil(100_000 / 3));
  assert.equal(f.neededPerMonthCents, 50_000 + 90_000 + 0 + 33_334);
  assert.equal(f.monthlySavingsCents, 172_009);
});

test("pace adds spending up day by day and compares it with last month on the same day", () => {
  const rows = [
    { date: "2026-11-01", merchant: "a", cents: 10_000 },
    { date: "2026-11-02", merchant: "a", cents: 5_000 },
    { date: "2026-11-30", merchant: "a", cents: 20_000 },
    { date: "2026-12-01", merchant: "a", cents: 30_000 },
    { date: "2026-12-03", merchant: "a", cents: 2_000 },
  ];
  const p = spendingPace(rows, "2026-12", "2026-12-04", 300_000);
  assert.deepEqual(p.thisMonthCents, [30_000, 30_000, 32_000, 32_000]);
  assert.equal(p.lastMonthCents.length, 30);
  assert.equal(p.lastMonthCents[3], 15_000); // Nov 4
  assert.equal(p.lastMonthCents[29], 35_000);
  assert.equal(p.lastMonthSameDayCents, 15_000);
  assert.equal(p.aheadByCents, 17_000);
  assert.equal(p.projectedCents, Math.round((32_000 / 4) * 31));
  assert.equal(p.budgetCents, 300_000);
  // A purchase dated after "today" is left out, so it cannot stretch the line.
  const early = spendingPace([...rows, { date: "2026-12-20", merchant: "a", cents: 99_000 }], "2026-12", "2026-12-04", null);
  assert.equal(early.thisMonthCents.length, 4);
  assert.deepEqual(early.thisMonthCents, [30_000, 30_000, 32_000, 32_000]);
  // A finished month projects to what it was.
  const done = spendingPace(rows, "2026-11", "2026-12-04", null);
  assert.equal(done.projectedCents, 35_000);
  assert.equal(done.budgetCents, null);
});

test("budget suggestions use the middle of three full months, round up to $5, and skip what is already budgeted", () => {
  const rows = [
    ...[["2026-11", 50_000], ["2026-10", 60_000], ["2026-09", 55_000]].map(([m, c]) => ({ date: `${m}-10`, category: "groceries", cents: c as number })),
    ...[["2026-11", 30_333], ["2026-10", 0], ["2026-09", 31_000]].map(([m, c]) => ({ date: `${m}-10`, category: "dining_out", cents: c as number })),
    { date: "2026-11-10", category: "tiny", cents: 900 },
    { date: "2026-11-10", category: "budgeted", cents: 99_000 },
    { date: "2026-12-02", category: "this_month", cents: 99_000 }, // not a full month
    { date: "2026-08-10", category: "too_old", cents: 99_000 },
  ];
  const s = budgetSuggestions(rows, new Set(["budgeted"]), "2026-12-03");
  assert.deepEqual(s, [
    { category: "groceries", typicalCents: 55_000, suggestedLimitCents: 55_000 },
    { category: "dining_out", typicalCents: 30_333, suggestedLimitCents: 30_500 },
  ]);
});

test("an unusual charge is far above what the merchant usually charges, and needs history to judge", () => {
  const tx = (id: string, date: string, dollars: number, merchant = "Cafe Nine") => ({ id, merchant, date, amountCents: -dollars * 100 });
  const found = unusualCharges([
    tx("1", "2026-08-01", 10), tx("2", "2026-09-01", 10), tx("3", "2026-10-01", 12), tx("4", "2026-11-01", 11),
    tx("5", "2026-11-20", 55), // 5 times the usual
    tx("6", "2026-11-25", 25), // twice the usual of $12, but only $13 more, under the $20 floor
    tx("x", "2026-11-02", 500, "New Place"), // no history
    { id: "in", merchant: "Cafe Nine", date: "2026-11-26", amountCents: 9_999 }, // money in is ignored
  ]);
  // The earlier charges are $10, $10, $11 and $12, so the usual is $10.50 and $55 is 5.2 times that.
  assert.deepEqual(found.map((f) => [f.id, f.usualCents, Math.round(f.ratio * 10) / 10]), [["5", 1_050, 5.2]]);
  assert.deepEqual(unusualCharges([tx("1", "2026-01-01", 10), tx("2", "2026-02-01", 10), tx("3", "2026-03-01", 300)]), [], "three charges is not enough history to call the third unusual");
});

test("paying a card down lowers utilization and lifts the estimated score range, and the payment is held to the balance", () => {
  const accounts = [
    account({ id: "a", type: "credit_card", name: "Card A", balanceCents: 400_000, creditLimitCents: 800_000 }),
    account({ id: "b", type: "credit_card", name: "Card B", balanceCents: 0, creditLimitCents: 200_000 }),
    account({ id: "c", type: "checking", balanceCents: 1 }),
  ];
  const w = creditWhatIf(accounts, "a", 300_000, 700)!;
  assert.equal(w.mocked, true);
  assert.equal(w.paymentCents, 300_000);
  assert.deepEqual([w.before.cardUtilization, w.before.totalUtilization, w.before.scoreLow, w.before.scoreHigh], [0.5, 0.4, 685, 715]);
  assert.deepEqual([w.after.cardUtilization, w.after.totalUtilization], [0.125, 0.1]);
  // From 40% (about -32.5 points) to 10% (-5): +27.5.
  assert.deepEqual([w.after.scoreLow, w.after.scoreHigh], [713, 743]);

  const over = creditWhatIf(accounts, "a", 9_000_000, 700)!;
  assert.equal(over.paymentCents, 400_000);
  assert.equal(over.after.totalUtilization, 0);
  assert.equal(creditWhatIf(accounts, "nope", 1, 700), null);
  assert.equal(creditWhatIf(accounts, "c", 1, 700), null, "a checking account is not a card");
});

test("a debt with no interest clears in as many months as its minimum allows", () => {
  const plan = payoffPlan([{ id: "d", name: "Debt", balanceCents: 30_000, annualRate: 0, minimumPaymentCents: 10_000 }], 0, "avalanche", "2026-12-03");
  assert.equal(plan.months, 3);
  assert.equal(plan.totalInterestCents, 0);
  assert.deepEqual(plan.balanceByMonth, [30_000, 20_000, 10_000, 0]);
  assert.equal(plan.payoffDate, "2027-03-03");
  assert.deepEqual(plan.order, [{ id: "d", name: "Debt", clearedInMonth: 3 }]);
});

test("avalanche clears the highest rate first and pays less interest than snowball, and extra money shortens both", () => {
  const debts = [
    { id: "small", name: "Small", balanceCents: 50_000, annualRate: 0.02, minimumPaymentCents: 2_500 },
    { id: "big", name: "Big", balanceCents: 400_000, annualRate: 0.25, minimumPaymentCents: 12_000 },
  ];
  const a = payoffPlan(debts, 20_000, "avalanche", "2026-12-03");
  const s = payoffPlan(debts, 20_000, "snowball", "2026-12-03");
  assert.deepEqual(a.order.map((o) => o.id), ["big", "small"]);
  assert.deepEqual(s.order.map((o) => o.id), ["small", "big"]);
  assert.ok(a.months && s.months);
  assert.ok(a.totalInterestCents < s.totalInterestCents, "highest rate first costs less");
  assert.ok(a.months <= s.months);
  const more = payoffPlan(debts, 60_000, "avalanche", "2026-12-03");
  assert.ok(more.months! < a.months);
  assert.ok(more.totalInterestCents < a.totalInterestCents);
  // The line only ever goes down.
  for (let i = 1; i < a.balanceByMonth.length; i++) assert.ok(a.balanceByMonth[i]! <= a.balanceByMonth[i - 1]!);
  assert.equal(a.balanceByMonth.at(-1), 0);
  // A freed minimum rolls onto the next debt: the first debt clears before the second.
  assert.ok(a.order[0]!.clearedInMonth! < a.order[1]!.clearedInMonth!);
});

test("a debt whose minimum never beats its interest is reported as never paid off", () => {
  const plan = payoffPlan([{ id: "d", name: "Stuck", balanceCents: 10_000_000, annualRate: 0.3, minimumPaymentCents: 100 }], 0, "avalanche", "2026-12-03");
  assert.equal(plan.months, null);
  assert.equal(plan.payoffDate, null);
});

test("debt payoff covers cards and loans, not a mortgage, fills a missing minimum, and reports what avalanche saves", () => {
  const accounts = [
    account({ id: "card", type: "credit_card", balanceCents: 130_316, annualRate: 0.2299, minimumPaymentCents: 3_500 }),
    account({ id: "promo", type: "credit_card", balanceCents: 180_000, annualRate: 0, minimumPaymentCents: 4_000 }),
    account({ id: "auto", type: "loan", loanKind: "auto", balanceCents: 900_000, annualRate: 0.0699, minimumPaymentCents: 38_900 }),
    account({ id: "nomin", type: "loan", loanKind: "personal", balanceCents: 200_000, annualRate: 0.1 }), // no minimum on file
    account({ id: "mort", type: "mortgage", balanceCents: 20_000_000, annualRate: 0.04, minimumPaymentCents: 132_000 }),
    account({ id: "paid", type: "credit_card", balanceCents: 0 }),
  ];
  const p = debtPayoff(accounts, 10_000, "2026-12-03");
  assert.deepEqual(p.debts.map((d) => d.id).sort(), ["auto", "card", "nomin", "promo"]);
  assert.equal(p.debts.find((d) => d.id === "nomin")!.minimumPaymentCents, 4_000); // 2% of $2,000
  assert.equal(p.plans.length, 2);
  assert.ok(p.plans.every((x) => x.months !== null));
  assert.equal(p.avalancheSavesCents, Math.max(0, p.plans[1]!.totalInterestCents - p.plans[0]!.totalInterestCents));
  assert.equal(p.avalancheFinishesSoonerMonths, Math.max(0, (p.plans[1]!.months ?? 0) - (p.plans[0]!.months ?? 0)));
  assert.equal(p.extraPerMonthCents, 10_000);
  assert.deepEqual(debtPayoff([account({ id: "chk", type: "checking", balanceCents: 5 })], 0, "2026-12-03").plans, []);
});

test("the health score weights four parts, and a part with no data drops out and the rest are re-weighted", () => {
  const top = healthScore({ asOf: "2026-12-03", savingsRate: 0.25, debtToIncome: 0.1, utilization: 0.05, runwayMonths: 8 });
  assert.equal(top.score, 100);
  assert.equal(top.label, "Strong");
  assert.equal(Math.round(top.parts.reduce((s, p) => s + p.weight, 0) * 1000) / 1000, 1);

  const mid = healthScore({ asOf: "2026-12-03", savingsRate: 0.1, debtToIncome: 0.36, utilization: 0.3, runwayMonths: 3 });
  // 50 (savings), 65 (dti), 75 (utilization), 60 (runway), weighted 30/25/20/25.
  assert.deepEqual(mid.parts.map((p) => p.score), [50, 65, 75, 60]);
  assert.equal(mid.score, Math.round(50 * 0.3 + 65 * 0.25 + 75 * 0.2 + 60 * 0.25));
  assert.equal(mid.label, "Good");

  const partial = healthScore({ asOf: "2026-12-03", savingsRate: 0.2, debtToIncome: null, utilization: null, runwayMonths: 6 });
  assert.equal(partial.score, 100);
  assert.deepEqual(partial.parts.map((p) => p.hasData), [true, false, false, true]);
  assert.equal(Math.round(partial.parts.reduce((s, p) => s + p.weight, 0) * 1000) / 1000, 1);

  const low = healthScore({ asOf: "2026-12-03", savingsRate: -0.1, debtToIncome: 0.7, utilization: 0.95, runwayMonths: 0.2 });
  assert.equal(low.label, "Needs Work");
  assert.equal(low.parts[0]!.valueText, "0% saved", "a negative rate reads as none saved");
  assert.equal(healthScore({ asOf: "x", savingsRate: null, debtToIncome: null, utilization: null, runwayMonths: null }).score, 0);
});

test("allocation drift compares each class with its target, in dollars to move, and flags what is outside the band", () => {
  const allocation = [
    { assetClass: "us_stocks" as const, valueCents: 7_000_000 },
    { assetClass: "international" as const, valueCents: 1_500_000 },
    { assetClass: "bonds" as const, valueCents: 1_000_000 },
    { assetClass: "crypto" as const, valueCents: 100_000 },
    { assetClass: "cash" as const, valueCents: 400_000 },
  ];
  const d = allocationDrift(allocation, null);
  assert.equal(d.targetsSet, false);
  assert.equal(d.totalCents, 10_000_000);
  const row = (c: string) => d.rows.find((r) => r.assetClass === c)!;
  assert.equal(row("us_stocks").moveCents, -1_500_000); // 70% to 55% of $100,000
  assert.equal(row("us_stocks").outside, true);
  assert.equal(row("bonds").moveCents, 1_500_000); // 10% to 25%
  assert.equal(row("international").outside, false);
  assert.equal(row("cash").outside, false);
  assert.ok(Math.abs(d.rows.reduce((s, r) => s + r.moveCents, 0)) <= 5, "what to add equals what to trim");

  const own = allocationDrift(allocation, { us_stocks: 0.7, international: 0.15, bonds: 0.1, crypto: 0.01, cash: 0.04 });
  assert.equal(own.targetsSet, true);
  assert.ok(own.rows.every((r) => !r.outside && r.moveCents === 0));
  assert.equal(allocationDrift([], null).totalCents, 0);
});

test("only a source that moves a lot month to month counts as variable", () => {
  const months = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"].map((month, i) => ({
    month,
    categories: [
      { categoryId: "income.paycheck", totalCents: 570_000 },
      { categoryId: "income.self_employed", totalCents: [65_000, 0, 120_000, 40_000, 65_000, 0][i]! },
      { categoryId: "income.interest", totalCents: [6_200, 6_300, 6_100, 6_400, 6_300, 6_250][i]! },
      { categoryId: "income.dividends", totalCents: i === 0 ? 2_000 : 0 }, // one month only
    ],
  }));
  const v = incomeVariability(months);
  assert.deepEqual(v, [{ categoryId: "income.self_employed", lowCents: 40_000, highCents: 120_000, typicalCents: 65_000, months: 4 }]);
});

test("copilot impact counts checks that would slip a goal or dip under the cushion", () => {
  const event = (price: number, delays: Array<number | null>, after: number | null, createdAt = "2026-12-03T12:00:00.000Z") => ({
    extractedPriceCents: price,
    createdAt,
    metrics: { goalImpacts: delays.map((d) => ({ goalId: "g", goalName: "G", probabilityLowDelta: 0, probabilityHighDelta: 0, probabilityLowAfter: 0, probabilityHighAfter: 0, delayMonths: d })), liquidBufferAfterCents: after, bufferTargetCents: 250_000 },
  }) as unknown as Parameters<typeof copilotImpact>[0][number];
  const impact = copilotImpact([
    event(32_900, [0, null], 400_000), // fine
    event(149_900, [3, 1], 300_000), // slips a goal by 3
    event(9_900, [0], 100_000), // under the cushion, no slip
    event(5_000, [-2], null), // an earlier date is not a slip
  ], "2026-12-03");
  assert.deepEqual({ ...impact, weeks: undefined }, { checked: 4, flagged: 2, flaggedCents: 159_800, goalMonthsAtStake: 3, weeks: undefined });
  const empty = copilotImpact([], "2026-12-03");
  assert.equal(empty.checked, 0);
  assert.equal(empty.weeks.length, 8);
  assert.equal(empty.weeks.at(-1)!.weekStart, "2026-11-30"); // the Monday of the week that holds Dec 3
  // The four checks above were all on Dec 3, so they land in the last week.
  assert.deepEqual(impact.weeks.at(-1), { weekStart: "2026-11-30", checked: 4, flagged: 2 });
  assert.equal(impact.weeks.slice(0, -1).every((w) => w.checked === 0 && w.flagged === 0), true);
});

test("the money calendar adds paydays and takes away bills and card minimums, day by day", () => {
  const cal = moneyCalendar({
    asOf: "2026-12-03",
    checkingCents: 100_000,
    paydays: ["2026-12-15"],
    paydayCents: 200_000,
    bills: [{ date: "2026-12-05", label: "Rent", cents: 150_000 }, { date: "2027-02-01", label: "Too far", cents: 9_999 }],
    cardDues: [{ date: "2026-12-10", label: "Visa", cents: 5_000 }, { date: "2026-12-12", label: "No minimum", cents: null }],
  });
  assert.equal(cal.balanceByDay.length, 30);
  assert.equal(cal.balanceByDay[0], 100_000);
  assert.equal(cal.balanceByDay[2], -50_000); // Dec 5, after rent
  assert.equal(cal.balanceByDay[7], -55_000); // Dec 10, after the card
  assert.equal(cal.balanceByDay[12], 145_000); // Dec 15, after payday
  assert.equal(cal.lowestCents, -55_000);
  assert.equal(cal.lowestDate, "2026-12-10");
  assert.equal(cal.events.length, 4, "an event past the window is left out");
});

test("paydays ahead follow the days of the month paychecks landed on", () => {
  const { dates, expectedCents } = paydaysAhead(
    [{ date: "2026-11-01", amountCents: 300_000 }, { date: "2026-11-15", amountCents: 300_000 }, { date: "2026-11-30", amountCents: 300_000 }],
    "2026-12-03",
    30,
  );
  assert.deepEqual(dates, ["2026-12-15", "2026-12-30", "2027-01-01"].filter((d) => d <= "2027-01-02"));
  assert.equal(expectedCents, 300_000);
});

const ag = (id: string, name: string, rank: number, flexibility: "flexible" | "non_negotiable", needed: number, remaining = needed * 12, monthsLeft = 12) =>
  ({ id, name, priorityRank: rank, flexibility, neededPerMonthCents: needed, remainingCents: remaining, monthsLeft });

test("savings go to goals in priority order, and what is left over is shown", () => {
  const a = goalAllocation({ asOf: "2026-12-03", monthlySavingsCents: 100_000, goals: [ag("b", "Kitchen", 2, "flexible", 30_000), ag("a", "House", 1, "non_negotiable", 50_000)] });
  assert.deepEqual(a.rows.map((r) => [r.name, r.allocatedCents, r.shortCents]), [["House", 50_000, 0], ["Kitchen", 30_000, 0]]);
  assert.equal(a.unallocatedCents, 20_000);
  assert.equal(a.rebalance, null);
});

test("when savings run out the lowest-priority goal is short", () => {
  const a = goalAllocation({ asOf: "2026-12-03", monthlySavingsCents: 70_000, goals: [ag("a", "House", 1, "flexible", 50_000), ag("b", "Kitchen", 2, "flexible", 30_000)] });
  assert.deepEqual(a.rows.map((r) => r.shortCents), [0, 10_000]);
  assert.equal(a.unallocatedCents, 0);
  assert.equal(a.rebalance, null, "a short flexible goal is not rescued by moving another flexible one");
});

test("a fixed-date goal that is short can be funded by reordering behind a flexible goal above it, and the cost is stated", () => {
  const goals = [ag("k", "Kitchen", 1, "flexible", 40_000, 480_000, 12), ag("h", "House", 2, "non_negotiable", 50_000, 600_000, 12)];
  const a = goalAllocation({ asOf: "2026-12-03", monthlySavingsCents: 70_000, goals });
  assert.deepEqual(a.rows.map((r) => [r.name, r.shortCents]), [["Kitchen", 0], ["House", 20_000]]);
  const r = a.rebalance!;
  assert.equal(r.receiverName, "House");
  assert.equal(r.donorName, "Kitchen");
  assert.equal(r.movedCents, 20_000);
  assert.deepEqual([...r.newRanks].sort((x, y) => x.priorityRank - y.priorityRank), [{ goalId: "h", priorityRank: 1 }, { goalId: "k", priorityRank: 2 }]);
  const kitchen = r.effects.find((e) => e.goalId === "k")!;
  assert.equal(kitchen.afterCents, 20_000);
  assert.equal(kitchen.delayMonths, 12); // 480,000 / 20,000 = 24 months, 12 over
});

test("no rebalance is offered if reordering would still leave the fixed goal short", () => {
  const a = goalAllocation({ asOf: "2026-12-03", monthlySavingsCents: 30_000, goals: [ag("k", "Kitchen", 1, "flexible", 20_000), ag("h", "House", 2, "non_negotiable", 50_000)] });
  assert.equal(a.rebalance, null);
});
