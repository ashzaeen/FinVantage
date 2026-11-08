import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@finvantage/contracts";
import {
  averageSpendByCategory,
  evaluateExpression,
  expressionNumbers,
  fullMonthsBefore,
  goalPlan,
  monthsUntil,
  planSpendingCuts,
} from "./advisor";

test("months until a date count a partial month, and never go negative", () => {
  assert.equal(monthsUntil("2026-11-08", "2027-06-01"), 7);
  assert.equal(monthsUntil("2026-11-08", "2027-06-08"), 7);
  assert.equal(monthsUntil("2026-11-08", "2027-06-09"), 8);
  assert.equal(monthsUntil("2026-11-08", "2026-01-01"), 0);
});

test("a goal plan gives the gap and the monthly amount to close it", () => {
  assert.deepEqual(goalPlan({ targetCents: 450_000, currentCents: 150_000, targetDate: "2027-06-01" }, "2026-11-08"), {
    gapCents: 300_000,
    monthsLeft: 7,
    monthlyNeededCents: 42_858,
  });
  assert.equal(goalPlan({ targetCents: 100, currentCents: 100, targetDate: "2020-01-01" }, "2026-11-08").monthlyNeededCents, 0);
  assert.equal(goalPlan({ targetCents: 200, currentCents: 100, targetDate: "2020-01-01" }, "2026-11-08").monthlyNeededCents, null);
});

test("full months before today, oldest first, across a year boundary", () => {
  assert.deepEqual(fullMonthsBefore("2027-02-14", 3), ["2026-11", "2026-12", "2027-01"]);
});

const tx = (date: string, amountCents: number, category: string | null): Transaction =>
  ({ id: date + amountCents, accountId: "a", date, amountCents, merchant: "m", category, isRecurring: false } as Transaction);

test("category averages use money out in the window only", () => {
  const rows = averageSpendByCategory(
    [tx("2026-10-02", -30_000, "dining"), tx("2026-09-02", -15_000, "dining"), tx("2026-10-05", -6_000, "shopping"), tx("2026-10-06", 500_000, "income"), tx("2026-11-01", -99_999, "dining")],
    ["2026-08", "2026-09", "2026-10"],
  );
  assert.deepEqual(rows, [{ categoryId: "dining", averageMonthlyCents: 15_000 }, { categoryId: "shopping", averageMonthlyCents: 2_000 }]);
});

test("cuts come from the biggest categories first, capped at half of each", () => {
  const plan = planSpendingCuts([{ categoryId: "dining", averageMonthlyCents: 40_000 }, { categoryId: "shopping", averageMonthlyCents: 20_000 }], 25_000);
  assert.deepEqual(plan.cuts.map((c) => [c.categoryId, c.cutCents]), [["dining", 20_000], ["shopping", 5_000]]);
  assert.equal(plan.coversTarget, true);

  const short = planSpendingCuts([{ categoryId: "dining", averageMonthlyCents: 10_000 }], 25_000);
  assert.equal(short.coversTarget, false);
  assert.equal(short.shortfallCents, 20_000);

  const untargeted = planSpendingCuts([{ categoryId: "dining", averageMonthlyCents: 40_000 }], null);
  assert.equal(untargeted.cuts[0]!.cutCents, 10_000);
  assert.equal(untargeted.coversTarget, null);
});

test("the calculator does arithmetic with precedence and parentheses, never eval", () => {
  assert.equal(evaluateExpression("(4,500 - 1,500) / 7"), 3000 / 7);
  assert.equal(evaluateExpression("2 + 3 * 4"), 14);
  assert.equal(evaluateExpression("-(2 + 3) * 2"), -10);
  assert.equal(evaluateExpression("10 % 4"), 2);
  assert.throws(() => evaluateExpression("1 / 0"), /zero/);
  assert.throws(() => evaluateExpression("2 +"), /early/);
  assert.throws(() => evaluateExpression("process.exit()"), /Unexpected/);
  assert.throws(() => evaluateExpression("(1 + 2"), /parenthesis/);
  assert.deepEqual(expressionNumbers("(4,500 - 1,500) / 7"), [4500, 1500, 7]);
});
