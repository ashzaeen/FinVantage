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
