import assert from "node:assert/strict";
import { test } from "node:test";
import { nextScheduledAt } from "./email-scheduler";

test("monthly schedules keep their UTC time and clamp short months", () => {
  assert.equal(
    nextScheduledAt("monthly", "2026-01-31T15:30:00.000Z"),
    "2026-02-28T15:30:00.000Z",
  );
});

test("quarterly schedules advance three calendar months", () => {
  assert.equal(
    nextScheduledAt("quarterly", "2026-11-07T15:30:00.000Z"),
    "2027-02-07T15:30:00.000Z",
  );
});
