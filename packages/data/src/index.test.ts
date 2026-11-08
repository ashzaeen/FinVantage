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

test("each user gets their own copy of the demo profile, and reloading one leaves others alone", async () => {
  const { MemoryLedgerStore, DEMO_USER_ID } = await import("./index");
  const ledger = new MemoryLedgerStore();
  const demoAccounts = await ledger.listAccounts(DEMO_USER_ID);
  assert.equal(await ledger.getUser("user_abc"), null);

  await ledger.loadDemoProfile("user_abc");
  const accounts = await ledger.listAccounts("user_abc");
  assert.equal(accounts.length, demoAccounts.length);
  assert.ok(accounts.every((a) => a.userId === "user_abc" && a.id.startsWith("user_abc__")));
  assert.equal((await ledger.getUser("user_abc"))?.id, "user_abc");
  assert.equal(
    (await ledger.listTransactions("user_abc", 100)).length,
    (await ledger.listTransactions(DEMO_USER_ID, 100)).length,
  );
  const goals = await ledger.listGoals("user_abc");
  assert.ok(goals.every((g) => g.linkedAccountId === null || g.linkedAccountId.startsWith("user_abc__")));

  await ledger.createGoal(DEMO_USER_ID, { ...goals[0]!, linkedAccountId: null });
  await ledger.loadDemoProfile("user_abc");
  assert.equal((await ledger.listGoals(DEMO_USER_ID)).length, goals.length + 1);
  assert.equal((await ledger.listAccounts("user_abc")).length, demoAccounts.length);
});
