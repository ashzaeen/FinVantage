import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_DATA_ENDS_ON, demoSafeToday, loadDemoProfileFixture } from "./profile";

test("the clock never runs behind the demo data, and stops mattering once the date has passed", () => {
  assert.equal(demoSafeToday("2026-11-23"), DEMO_DATA_ENDS_ON);
  assert.equal(demoSafeToday(DEMO_DATA_ENDS_ON), DEMO_DATA_ENDS_ON);
  assert.equal(demoSafeToday("2026-12-04"), "2026-12-04");
  assert.equal(demoSafeToday("2027-03-01"), "2027-03-01");
});

test("DEMO_DATA_ENDS_ON is the last day of the demo's transactions", () => {
  const { transactions } = loadDemoProfileFixture();
  const last = transactions.map((t) => t.date).sort().at(-1);
  assert.ok(last, "the fixture has transactions");
  assert.ok(last <= DEMO_DATA_ENDS_ON, `a transaction is dated ${last}, after ${DEMO_DATA_ENDS_ON}`);
  // Within a few days: a constant that lags far behind the data would let future-dated rows through.
  const gapDays = (Date.parse(`${DEMO_DATA_ENDS_ON}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000;
  assert.ok(gapDays <= 3, `the data ends ${gapDays} days before DEMO_DATA_ENDS_ON`);
});
