import assert from "node:assert/strict";
import { test } from "node:test";
import { runHealthChecks } from "./health";

test("a check that hangs counts as down", async () => {
  const report = await runHealthChecks(
    [
      { name: "fast", check: async () => {} },
      { name: "hangs", check: () => new Promise(() => {}) },
    ],
    { timeoutMs: 50 },
  );
  assert.deepEqual(report, { ok: false, stores: { fast: "ok", hangs: "down" } });
});

test("no databases configured is healthy", async () => {
  assert.deepEqual(await runHealthChecks([]), { ok: true, stores: {} });
});
