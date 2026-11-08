import assert from "node:assert/strict";
import { test } from "node:test";
import { createStores, MemoryDocumentStore } from "./index";

test("an invalid MongoDB URI falls back to memory during development", () => {
  const originalWarn = console.warn;
  let warning = "";
  console.warn = (message) => {
    warning = String(message);
  };
  try {
    const stores = createStores({
      NODE_ENV: "development",
      LEDGER_BACKEND: "memory",
      DOCUMENT_BACKEND: "mongodb",
      MONGODB_URI: '://"',
    });
    assert.ok(stores.docs instanceof MemoryDocumentStore);
    assert.match(warning, /Using the in-memory document store/);
  } finally {
    console.warn = originalWarn;
  }
});

test("an invalid MongoDB URI still fails closed in production", () => {
  assert.throws(
    () =>
      createStores({
        NODE_ENV: "production",
        LEDGER_BACKEND: "memory",
        DOCUMENT_BACKEND: "mongodb",
        MONGODB_URI: '://"',
      }),
    /MongoDB configuration is invalid/,
  );
});

test("a due email schedule can only be claimed once", async () => {
  const docs = new MemoryDocumentStore();
  await docs.saveEmailSchedule("user_demo", {
    id: "schedule_demo",
    userId: "user_demo",
    enabled: true,
    frequency: "daily",
    recipientEmail: "recipient@example.com",
    lastSentAt: null,
    lastStatus: "idle",
    lastError: null,
    lastReportId: null,
    nextScheduledAt: "2026-11-07T10:00:00.000Z",
    leaseExpiresAt: null,
    activeAttemptId: null,
    updatedAt: "2026-11-07T09:00:00.000Z",
  });
  const claims = await Promise.all([
    docs.claimNextDueEmailSchedule(
      "2026-11-07T10:01:00.000Z",
      "2026-11-07T10:06:00.000Z",
      "attempt_one",
    ),
    docs.claimNextDueEmailSchedule(
      "2026-11-07T10:01:00.000Z",
      "2026-11-07T10:06:00.000Z",
      "attempt_two",
    ),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
});
