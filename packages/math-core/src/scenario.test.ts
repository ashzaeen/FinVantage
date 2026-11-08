import assert from "node:assert/strict";
import { test } from "node:test";
import type { SimulationInputs } from "@finvantage/contracts";
import {
  addMonthsIso,
  applyScenario,
  futureValue,
  growthRange,
  loanFigures,
  monthlyToReach,
  monthsToReach,
  payoffFigures,
  scenarioCashFigures,
} from "./advisor";

test("a car loan: $28,000 at 13% for 60 months with $3,000 down", () => {
  const loan = loanFigures(2_800_000, 300_000, 0.13, 60);
  assert.equal(loan.financedCents, 2_500_000);
  assert.equal(loan.monthlyPaymentCents, 56_883);
  assert.equal(loan.totalInterestCents, 56_883 * 60 - 2_500_000);
  assert.equal(loan.totalCostCents, 56_883 * 60 + 300_000);
});

test("growth is a range over named returns, and contributions are counted", () => {
  assert.equal(futureValue(50_000, 0, 0, 120), 50_000);
  const range = growthRange(50_000, 0, 10);
  assert.equal(range.contributedCents, 50_000);
  assert.ok(range.lowCents < range.typicalCents && range.typicalCents < range.highCents);
  assert.equal(range.typicalCents, futureValue(50_000, 0, 0.07, 120));
});

test("payoff takes longer at a lower payment, and never ends below the interest", () => {
  const fast = payoffFigures(500_000, 0.24, 50_000);
  const slow = payoffFigures(500_000, 0.24, 20_000);
  assert.ok(fast.months! < slow.months!);
  assert.ok(fast.totalInterestCents! < slow.totalInterestCents!);
  assert.equal(payoffFigures(500_000, 0.24, 10_000).months, null);
});

test("monthly amount to reach a target, and months at a monthly amount", () => {
  assert.equal(monthlyToReach(300_000, 0, 3), 100_000);
  assert.equal(monthlyToReach(100, 200, 3), 0);
  assert.equal(monthlyToReach(100, 0, 0), null);
  assert.ok(monthlyToReach(1_000_000, 0, 120, 0.07)! < 1_000_000 / 120);
  assert.equal(monthsToReach(300_000, 0, 100_000), 3);
  assert.equal(monthsToReach(300_000, 0, 0), null);
});

test("dates move by months and clamp to the end of short months", () => {
  assert.equal(addMonthsIso("2026-11-08", 3), "2027-02-08");
  assert.equal(addMonthsIso("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonthsIso("2027-03-01", -6), "2026-09-01");
});

const inputs: SimulationInputs = {
  snapshot: {
    asOf: "2026-11-08",
    accounts: [
      { id: "c", userId: "u", type: "checking", name: "Checking", balanceCents: 500_000, annualRate: 0, minimumPaymentCents: null } as never,
    ],
    monthlyIncomeCents: 600_000,
    monthlyFixedCostsCents: 200_000,
    monthlyDebtPaymentsCents: 60_000,
    monthlySpendingCents: 400_000,
    monthlySavingsCents: 150_000,
    nextPaydayOn: "2026-11-15",
    bufferTargetCents: 250_000,
  },
  goals: [
    { id: "g1", userId: "u", name: "Emergency", targetCents: 1_000_000, currentCents: 200_000, targetDate: "2028-01-01", priorityRank: 1, flexibility: "non_negotiable", linkedAccountId: null },
  ],
  lifeEvents: [],
  whatIf: null,
};

test("a scenario turns a trip, a loan, and a new goal into simulator inputs", () => {
  const applied = applyScenario(inputs, [
    { kind: "one_time", label: "Trip", amountCents: -120_000, date: "2027-01-15" },
    { kind: "loan", label: "Car", priceCents: 2_800_000, downPaymentCents: 300_000, annualRate: 0.13, termMonths: 60, start: "2026-12-01" },
    { kind: "new_goal", label: "Arkansas trip", targetCents: 150_000, savedCents: 0, date: "2027-03-01", flexibility: "flexible", priorityRank: 1 },
    { kind: "savings_change", label: "Cut dining", monthlyCents: 20_000 },
  ]);
  assert.equal(applied.inputs.lifeEvents.length, 3, "trip, down payment, and loan payments");
  assert.equal(applied.loans[0]!.monthlyPaymentCents, 56_883);
  assert.equal(applied.upfrontCostCents, 120_000 + 300_000);
  assert.equal(applied.monthlyChangeCents, -56_883 + 20_000);
  assert.equal(applied.inputs.whatIf?.monthlySavingsDeltaCents, 20_000);
  const added = applied.inputs.goals.find((g) => g.id === applied.addedGoalIds[0]);
  assert.equal(added?.priorityRank, 1);
  assert.equal(applied.inputs.goals.find((g) => g.id === "g1")?.priorityRank, 2, "existing goals move down");
  assert.equal(inputs.goals[0]!.priorityRank, 1, "the original inputs are untouched");

  const cash = scenarioCashFigures(inputs.snapshot, applied);
  assert.equal(cash.liquidCashAfterUpfrontCents, 500_000 - 420_000);
  assert.ok(cash.debtToIncomeAfter > cash.debtToIncomeBefore);
  assert.ok(cash.runwayDaysAfter < cash.runwayDaysBefore);
});

test("shifting a goal moves its date and nothing else", () => {
  const applied = applyScenario(inputs, [{ kind: "shift_goal", label: "Later", goalId: "g1", months: 6 }]);
  assert.equal(applied.inputs.goals[0]!.targetDate, "2028-07-01");
  assert.equal(applied.inputs.lifeEvents.length, 0);
});
