import assert from "node:assert/strict";
import { test } from "node:test";
import { subscriptionSummaryLines } from "./artifacts";

test("no subscriptions block means no card", () => {
  assert.deepEqual(subscriptionSummaryLines(null), []);
});

test("the lines state the spend, the change and what was cancelled", () => {
  const lines = subscriptionSummaryLines({
    spendCents: 23_091,
    previousSpendCents: 20_000,
    changeCents: 3_091,
    chargedCount: 4,
    cancelled: [{ merchant: "StreamFlix", cancelledOn: "2026-10-02", monthlyCents: 1_549 }],
  });
  assert.equal(lines[0], "Charged $230.91 across 4 subscriptions.");
  assert.equal(lines[1], "$30.91 more than last quarter.");
  assert.equal(lines[2], "Marked StreamFlix cancelled on 2026-10-02, $15.49 a month.");
});

test("a missing comparison, a drop, a tie and one subscription read correctly", () => {
  const base = { spendCents: 1_000, chargedCount: 1, cancelled: [] };
  assert.equal(subscriptionSummaryLines({ ...base, previousSpendCents: null, changeCents: null })[1], "Not enough history to compare with last quarter.");
  assert.equal(subscriptionSummaryLines({ ...base, previousSpendCents: 1_000, changeCents: 0 })[1], "The same as last quarter.");
  assert.equal(subscriptionSummaryLines({ ...base, previousSpendCents: 1_500, changeCents: -500 })[1], "$5 less than last quarter.");
  assert.equal(subscriptionSummaryLines({ ...base, previousSpendCents: 1_000, changeCents: 0 })[0], "Charged $10 across 1 subscription.");
});

test("a cancelled subscription with no known monthly cost omits the figure", () => {
  const lines = subscriptionSummaryLines({
    spendCents: 0,
    previousSpendCents: null,
    changeCents: null,
    chargedCount: 0,
    cancelled: [{ merchant: "Gym", cancelledOn: "2026-09-30", monthlyCents: null }],
  });
  assert.equal(lines[2], "Marked Gym cancelled on 2026-09-30.");
});
