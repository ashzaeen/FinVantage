import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChangeRequest } from "@finvantage/contracts";
import { applyChange, type ChangeApi } from "../../../lib/changes";
import { createChangeStore, UNDO_WINDOW_MS } from "./change-store";
import type { DraftState } from "./draft-state";

/** An API that records each call and fails the ones named in `fail`. */
function fakeApi(fail: string[] = []) {
  const calls: string[] = [];
  const call = (name: string, result: unknown = {}) => async (input?: unknown) => {
    calls.push(`${name} ${JSON.stringify(input ?? {})}`);
    if (fail.includes(name)) throw new Error("boom");
    return result;
  };
  const api = {
    addTransaction: call("addTransaction", { id: "tx-new" }),
    updateTransaction: call("updateTransaction"),
    removeTransaction: call("removeTransaction", { result: "deleted" }),
    setBudget: call("setBudget"),
    deleteBudget: call("deleteBudget"),
    createGoal: call("createGoal", { id: "goal-new" }),
    updateGoal: call("updateGoal"),
    deleteGoal: call("deleteGoal"),
    updateSubscription: call("updateSubscription"),
  } as unknown as ChangeApi;
  return { api, calls };
}

const persistence = () => {
  const saved = new Map<string, DraftState>();
  return { saved, persist: { get: (id: string) => saved.get(id) ?? null, set: (id: string, s: DraftState) => void saved.set(id, s) } };
};

const goal = { name: "Trip", targetCents: 150_000, currentCents: 0, targetDate: "2027-03-01", priorityRank: 2, flexibility: "flexible" as const, linkedAccountId: null };
const budget: ChangeRequest = { action: "set_budget", body: { category: "dining", monthlyLimitCents: 40_000 }, previous: { category: "dining", monthlyLimitCents: 30_000 } };

test("every change is saved through its ordinary route, and has the undo that reverses it", async () => {
  const { api, calls } = fakeApi();
  const body = { accountId: "a", date: "2026-12-01", amountCents: -4_200, currency: "USD" as const, merchant: "Cafe", category: null, subcategory: null, isRecurring: false, pending: false, categoryDetailed: null, paymentChannel: null, logoUrl: null, originalAmountCents: null, exchangeRateToUsd: null, exchangeRateDate: null };
  const add = await applyChange(api, { action: "add_transaction", body });
  await add.undo!();
  assert.match(calls[0]!, /^addTransaction/);
  assert.equal(calls[1], 'removeTransaction {"params":{"id":"tx-new"}}', "an add is undone by deleting the new transaction");

  calls.length = 0;
  await (await applyChange(api, budget)).undo!();
  assert.match(calls[1]!, /^setBudget .*30000/, "undo puts the old limit back");

  calls.length = 0;
  await (await applyChange(api, { ...budget, previous: null })).undo!();
  assert.match(calls[1]!, /^deleteBudget/, "a brand new budget is undone by removing it");

  calls.length = 0;
  await (await applyChange(api, { action: "create_goal", body: goal })).undo!();
  assert.equal(calls[1], 'deleteGoal {"params":{"id":"goal-new"}}');

  calls.length = 0;
  const removed = await applyChange(api, { action: "remove_goal", id: "g1", previous: goal });
  assert.equal(removed.undo, null, "a deleted goal cannot be brought back");

  calls.length = 0;
  await (await applyChange(api, { action: "set_subscription_status", id: "s1", status: "cancelling", previousStatus: "keep" })).undo!();
  assert.match(calls[1]!, /"status":"keep"/);
});

test("confirming saves once, even if asked twice, and remembers it", async () => {
  const { api, calls } = fakeApi();
  const { saved, persist } = persistence();
  const store = createChangeStore({ api, persist });
  await Promise.all([store.confirm("m:0", budget), store.confirm("m:0", budget)]);
  assert.equal(calls.filter((c) => c.startsWith("setBudget")).length, 1);
  assert.equal(store.get("m:0").phase, "saved");
  assert.equal(saved.get("m:0"), "saved");
  await store.confirm("m:0", budget);
  assert.equal(calls.length, 1, "a saved change is not saved again");
});

test("a card reloaded after saving or dismissing does not offer the change again", () => {
  const { api } = fakeApi();
  const { persist } = persistence();
  persist.set("a:0", "saved");
  persist.set("b:0", "dismissed");
  const store = createChangeStore({ api, persist });
  assert.equal(store.get("a:0").phase, "saved");
  assert.equal(store.get("a:0").undo, null, "the undo does not survive a reload");
  assert.equal(store.get("b:0").phase, "dismissed");
  assert.equal(store.get("c:0").phase, "draft");
});

test("a failed save says so, saves nothing, and can be tried again", async () => {
  const failing = fakeApi(["setBudget"]);
  const { persist, saved } = persistence();
  const store = createChangeStore({ api: failing.api, persist });
  await store.confirm("m:0", budget);
  assert.equal(store.get("m:0").phase, "error");
  assert.ok(store.get("m:0").message.length > 0);
  assert.equal(saved.has("m:0"), false);
  assert.equal(store.get("m:0").undo, null);
});

test("undo works within 30 seconds and not after, and a dismissed draft saves nothing", async () => {
  const { api, calls } = fakeApi();
  const { persist } = persistence();
  let clock = 1_000;
  const store = createChangeStore({ api, persist, now: () => clock });

  await store.confirm("m:0", budget);
  assert.equal(store.lastUndoable(), "m:0");
  clock += UNDO_WINDOW_MS - 1;
  assert.equal(await store.undo("m:0"), true);
  assert.equal(store.get("m:0").phase, "undone");
  assert.equal(store.lastUndoable(), null);

  await store.confirm("n:0", budget);
  clock += UNDO_WINDOW_MS + 1;
  assert.equal(store.lastUndoable(), null, "too late");
  assert.equal(await store.undo("n:0"), false);
  assert.equal(store.get("n:0").phase, "saved");

  calls.length = 0;
  store.dismiss("p:0");
  assert.equal(store.get("p:0").phase, "dismissed");
  await store.confirm("p:0", budget);
  assert.equal(calls.length, 0, "a dismissed draft cannot be confirmed");
});

test("the page is told when a change is saved, but not when it fails or is only dismissed", async () => {
  const { api } = fakeApi(["deleteBudget"]);
  const { persist } = persistence();
  const store = createChangeStore({ api, persist });
  const heard: string[] = [];
  const off = store.onApplied((request) => void heard.push(request.action));
  await store.confirm("a:0", budget);
  await store.confirm("b:0", { action: "remove_budget", previous: { category: "dining", monthlyLimitCents: 1 } });
  store.dismiss("c:0");
  assert.deepEqual(heard, ["set_budget"]);
  off();
  await store.confirm("d:0", budget);
  assert.deepEqual(heard, ["set_budget"], "a removed listener hears nothing");
});
