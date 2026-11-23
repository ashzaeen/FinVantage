import assert from "node:assert/strict";
import { test } from "node:test";
import type { AdvisorVisual } from "@finvantage/contracts";
import { compareRows, difference } from "./visualCompare";

const loan = (monthly: number, interest: number) =>
  ({ kind: "loan_explorer", monthlyPaymentCents: monthly, totalInterestCents: interest, totalCostCents: monthly * 60 }) as unknown as AdvisorVisual;

test("two loans are set side by side and the difference is B minus A", () => {
  const rows = compareRows(loan(50_000, 400_000), loan(45_000, 500_000));
  assert.deepEqual(rows.map((r) => r.label), ["Monthly Payment", "Total Interest", "Total Cost"]);
  assert.equal(difference(rows[0]!), -5_000);
  assert.equal(difference(rows[1]!), 100_000);
});

test("a goal with a passed date has no monthly figure, so there is no difference", () => {
  const goal = (n: number | null) => ({ kind: "goal_plan", monthlyNeededCents: n }) as unknown as AdvisorVisual;
  const [row] = compareRows(goal(null), goal(10_000));
  assert.equal(difference(row!), null);
});

test("different kinds of visual are not compared", () => {
  const goal = { kind: "goal_plan", monthlyNeededCents: 1 } as unknown as AdvisorVisual;
  assert.deepEqual(compareRows(loan(1, 1), goal), []);
});
