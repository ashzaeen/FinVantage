import assert from "node:assert/strict";
import { test } from "node:test";
import { MemorySubscriptionStore, SubscriptionState } from "./subscriptions";

const state = (id: string, overrides: Partial<SubscriptionState> = {}): SubscriptionState => ({
  id,
  charge: { merchant: "StreamFlix", amountCents: -1549, cadence: "monthly", nextDate: "2026-12-03", accountId: "acct-1", category: "entertainment.streaming", source: "bank" },
  status: "cancelled",
  kind: null,
  cancelledOn: "2026-11-10",
  updatedAt: "2026-11-19T09:00:00.000Z",
  ...overrides,
});

test("a user with no choices has an empty list", async () => {
  assert.deepEqual(await new MemorySubscriptionStore().list("u1"), []);
});

test("a saved state comes back, and saving the same id replaces it", async () => {
  const store = new MemorySubscriptionStore();
  await store.save("u1", state("sub_a"));
  await store.save("u1", state("sub_b", { status: "keep", cancelledOn: null }));
  await store.save("u1", state("sub_a", { status: "active", cancelledOn: null }));
  const list = await store.list("u1");
  assert.deepEqual(list.map((s) => [s.id, s.status]).sort(), [["sub_a", "active"], ["sub_b", "keep"]]);
});

test("one user's choices never reach another's", async () => {
  const store = new MemorySubscriptionStore();
  await store.save("u1", state("sub_a"));
  assert.deepEqual(await store.list("u2"), []);
  await store.save("u2", state("sub_a", { status: "keep", cancelledOn: null }));
  assert.equal((await store.list("u1"))[0]!.status, "cancelled");
});

test("what the store hands out is a copy, so editing it changes nothing", async () => {
  const store = new MemorySubscriptionStore();
  const saved = await store.save("u1", state("sub_a"));
  saved.status = "active";
  (await store.list("u1"))[0]!.charge.merchant = "Changed";
  const [again] = await store.list("u1");
  assert.deepEqual([again!.status, again!.charge.merchant], ["cancelled", "StreamFlix"]);
});

test("a state that does not match the schema is refused", async () => {
  const store = new MemorySubscriptionStore();
  await assert.rejects(store.save("u1", state("sub_a", { cancelledOn: "yesterday" })));
  await assert.rejects(store.save("u1", state("sub_a", { status: "gone" as never })));
  assert.deepEqual(await store.list("u1"), []);
});
