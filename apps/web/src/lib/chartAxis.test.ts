import assert from "node:assert/strict";
import { test } from "node:test";
import { niceTicks } from "./chartAxis";

test("ticks are evenly spaced, include zero and cover the data", () => {
  const { domain, ticks } = niceTicks([-0.028, 0.069]);
  assert.ok(ticks.includes(0));
  assert.ok(domain[0] <= -0.028 && domain[1] >= 0.069);
  const steps = ticks.slice(1).map((t, i) => Math.round((t - ticks[i]!) * 1e9));
  assert.equal(new Set(steps).size, 1);
});

test("a flat series still gets a usable axis", () => {
  const { ticks } = niceTicks([0, 0]);
  assert.ok(ticks.length >= 3);
});

import { tickPercent } from "./chartAxis";
test("tick labels drop a trailing .0", () => {
  assert.equal(tickPercent(0.02), "2%");
  assert.equal(tickPercent(0.025), "2.5%");
  assert.equal(tickPercent(-0.03), "-3%");
});
