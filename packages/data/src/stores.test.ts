/**
 * The LedgerStore contract, run against every implementation. Memory always runs. Spacetime runs
 * when SPACETIME_TEST_TOKEN is set (an admin token), against SPACETIME_TEST_URL and
 * SPACETIME_TEST_DB (default Maincloud and "finvantage"), with throwaway user IDs that are deleted
 * afterwards:
 *
 *   SPACETIME_TEST_TOKEN=... npm test -w @finvantage/data
 */
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createBankProvider } from "./bank";
import { MemoryLedgerStore } from "./memory";
import { SpacetimeHttp } from "./spacetime/client";
import { SpacetimeLedgerStore } from "./spacetime/ledger";
import type { LedgerStore } from "./stores";

const spacetimeConfig = process.env.SPACETIME_TEST_TOKEN
  ? {
      url: process.env.SPACETIME_TEST_URL ?? "https://maincloud.spacetimedb.com",
      database: process.env.SPACETIME_TEST_DB ?? "finvantage",
      token: process.env.SPACETIME_TEST_TOKEN,
    }
  : null;

const backends: Array<{ name: string; make: () => LedgerStore; cleanup?: (userIds: string[]) => Promise<void> }> = [
  { name: "memory", make: () => new MemoryLedgerStore() },
];
if (spacetimeConfig) {
  backends.push({
    name: "spacetime",
    make: () => new SpacetimeLedgerStore(spacetimeConfig),
    cleanup: async (userIds) => {
      const db = new SpacetimeHttp(spacetimeConfig);
      for (const id of userIds) await db.call("delete_user_data", [id]);
    },
  });
}

const sortById = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

for (const backend of backends) {
  describe(`LedgerStore contract: ${backend.name}`, () => {
    const users: string[] = [];
    const newUser = () => {
      const id = `test_${randomUUID().slice(0, 8)}`;
      users.push(id);
      return id;
    };
    after(async () => backend.cleanup?.(users));

    test("the demo profile loads for a new user, matching the memory store exactly", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const reference = new MemoryLedgerStore();
      await reference.loadDemoProfile(userId);

      assert.equal((await store.getUser(userId))?.id, userId);
      assert.deepEqual(await store.getIncomeProfile(userId), await reference.getIncomeProfile(userId));
      assert.deepEqual(sortById(await store.listAccounts(userId)), sortById(await reference.listAccounts(userId)));
      assert.deepEqual(await store.listTransactions(userId, 100), await reference.listTransactions(userId, 100));
      assert.deepEqual(await store.listGoals(userId), await reference.listGoals(userId));
    });

    test("users only see their own data", async () => {
      const store = backend.make();
      const a = newUser();
      const b = newUser();
      await store.loadDemoProfile(a);
      assert.deepEqual(await store.listAccounts(b), []);
      assert.deepEqual(await store.listTransactions(b, 100), []);
      assert.equal(await store.getUser(b), null);
      assert.ok((await store.listAccounts(a)).every((x) => x.userId === a));
    });

    test("saving a user changes their profile", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const user = (await store.getUser(userId))!;
      await store.saveUser({ ...user, displayName: "Renamed", extensionSettings: { enabled: false, snoozedSites: ["shop.example"] } });
      const back = (await store.getUser(userId))!;
      assert.equal(back.displayName, "Renamed");
      assert.deepEqual(back.extensionSettings, { enabled: false, snoozedSites: ["shop.example"] });
    });

    test("hand-entered accounts and transactions can be created and edited", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const before = (await store.listTransactions(userId, 1000)).length;

      const account = await store.createAccount(userId, {
        type: "savings", loanKind: null, name: "Rainy Day", institution: "Local CU", balanceCents: 12_345,
        annualRate: 0.03, minimumPaymentCents: null, promoRateEndsOn: null,
        subtype: null, mask: null, availableBalanceCents: null, creditLimitCents: null, nextPaymentDueOn: null,
      });
      assert.ok((await store.listAccounts(userId)).some((a) => a.id === account.id && a.balanceCents === 12_345));

      const edited = await store.updateAccount(userId, account.id, { ...account, name: "Rainy Day Fund", balanceCents: 20_000 });
      assert.equal(edited?.name, "Rainy Day Fund");
      assert.equal((await store.listAccounts(userId)).find((a) => a.id === account.id)?.balanceCents, 20_000);

      const tx = await store.addTransaction({
        accountId: account.id, date: "2026-11-07", amountCents: -2_500, currency: "USD", originalAmountCents: null,
        exchangeRateToUsd: null, exchangeRateDate: null, merchant: "Corner Cafe", category: "dining", subcategory: null, isRecurring: false,
        pending: false, categoryDetailed: null, paymentChannel: null, logoUrl: null,
      });
      const list = await store.listTransactions(userId, 1000);
      assert.equal(list.length, before + 1);
      assert.equal(list[0]!.id, tx.id, "newest first");

      const fixed = await store.updateTransaction(userId, tx.id, { ...tx, merchant: "Corner Café", amountCents: -2_700 });
      assert.equal(fixed?.amountCents, -2_700);
      assert.equal((await store.listTransactions(userId, 1000)).find((t) => t.id === tx.id)?.merchant, "Corner Café");
    });

    test("editing a bank transaction overrides it without duplicating it", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const list = await store.listTransactions(userId, 1000);
      const grocery = list.find((t) => t.category === "groceries")!;
      const updated = await store.updateTransaction(userId, grocery.id, { ...grocery, category: "household", isRecurring: true });
      assert.equal(updated?.category, "household");
      const after = await store.listTransactions(userId, 1000);
      assert.equal(after.length, list.length);
      assert.equal(after.find((t) => t.id === grocery.id)?.category, "household");
      // Another user's transaction id can't be edited.
      assert.equal(await store.updateTransaction(newUser(), grocery.id, grocery), null);
    });

    test("editing a bank account's terms keeps it, and unknown ids return null", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const card = (await store.listAccounts(userId)).find((a) => a.type === "credit_card" && a.annualRate !== 0)!;
      const updated = await store.updateAccount(userId, card.id, { ...card, annualRate: 0.1999 });
      assert.equal(updated?.annualRate, 0.1999);
      assert.equal(updated?.balanceCents, card.balanceCents);
      assert.equal(await store.updateAccount(userId, "no-such-account", card), null);
    });

    test("goals can be created, edited, and deleted, and stay sorted by priority", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const goal = await store.createGoal(userId, {
        name: "Laptop", targetCents: 150_000, currentCents: 0, targetDate: "2027-06-01",
        priorityRank: 99, flexibility: "flexible", linkedAccountId: null,
      });
      assert.equal(goal.status, "not_started");
      const goals = await store.listGoals(userId);
      assert.equal(goals.at(-1)?.id, goal.id);

      const updated = await store.updateGoal(userId, goal.id, { ...goal, currentCents: 150_000, status: undefined });
      assert.equal(updated?.status, "achieved");
      assert.equal((await store.listGoals(userId)).find((g) => g.id === goal.id)?.currentCents, 150_000);

      assert.equal(await store.deleteGoal(userId, goal.id), true);
      assert.equal(await store.deleteGoal(userId, goal.id), false);
      assert.equal((await store.listGoals(userId)).length, goals.length - 1);
    });

    test("a linked bank syncs incrementally, keeps edits, and can be removed", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const accountsBefore = (await store.listAccounts(userId)).length;
      const transactionsBefore = (await store.listTransactions(userId, 1000)).length;

      const bank = createBankProvider({ BANK_PROVIDER: "synthetic" });
      const { itemId, accessToken } = await bank.exchangePublicToken("synthetic-public-token");
      const first = await bank.fetchItem(accessToken, null);
      await store.applyBankUpdate(userId, first);
      const [item] = await store.listBankItems(userId);
      assert.equal(item?.itemId, itemId);
      assert.equal(item?.accountCount, 8);
      assert.equal(item?.transactionsCursor, "synthetic-cursor");
      assert.equal((await store.listAccounts(userId)).length, accountsBefore + 8);
      assert.equal((await store.listTransactions(userId, 1000)).length, transactionsBefore + first.added.length);

      // The user edits a bank transaction, then the next sync removes one and adds one.
      const groceries = (await store.listTransactions(userId, 1000)).find((t) => t.id === `${itemId}__txn_06`)!;
      await store.updateTransaction(userId, groceries.id, { ...groceries, category: "household" });
      const added = { ...first.added[0]!, transaction_id: `${itemId}__txn_new`, date: "2026-11-07", amount: 42 };
      await store.applyBankUpdate(userId, {
        ...first,
        added: [added],
        modified: [],
        removedTransactionIds: [`${itemId}__txn_07`],
        nextCursor: "synthetic-cursor-2",
      });
      const after = await store.listTransactions(userId, 1000);
      assert.equal(after.length, transactionsBefore + first.added.length);
      assert.equal(after[0]?.id, `${itemId}__txn_new`);
      assert.equal(after[0]?.amountCents, -4200);
      assert.ok(!after.some((t) => t.id === `${itemId}__txn_07`));
      assert.equal(after.find((t) => t.id === groceries.id)?.category, "household", "edits survive a sync");
      assert.equal((await store.listBankItems(userId))[0]?.transactionsCursor, "synthetic-cursor-2");

      // Another user can't remove it; the owner can, and everything under it goes.
      assert.equal(await store.removeBankItem(newUser(), itemId), false);
      assert.equal(await store.removeBankItem(userId, itemId), true);
      assert.deepEqual(await store.listBankItems(userId), []);
      assert.equal((await store.listAccounts(userId)).length, accountsBefore);
      assert.equal((await store.listTransactions(userId, 1000)).length, transactionsBefore);
    });

    test("reloading the demo profile resets a user's edits", async () => {
      const store = backend.make();
      const userId = newUser();
      await store.loadDemoProfile(userId);
      const accounts = await store.listAccounts(userId);
      await store.createGoal(userId, {
        name: "Temp", targetCents: 1_000, currentCents: 0, targetDate: "2027-01-01",
        priorityRank: 50, flexibility: "flexible", linkedAccountId: null,
      });
      await store.loadDemoProfile(userId);
      assert.equal((await store.listGoals(userId)).some((g) => g.name === "Temp"), false);
      assert.deepEqual(sortById(await store.listAccounts(userId)), sortById(accounts));
    });
  });
}
