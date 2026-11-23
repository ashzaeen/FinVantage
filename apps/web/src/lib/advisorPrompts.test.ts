import assert from "node:assert/strict";
import { test } from "node:test";
import { personalPrompts } from "./advisorPrompts";

const label = (id: string) => ({ groceries: "Groceries", dining_out: "Dining Out" })[id] ?? id;
const flag = (type: "price_up" | "possible_duplicate", extra: Record<string, unknown> = {}) => ({ type, previousCents: null, currentCents: null, changedOn: null, group: null, ...extra }) as const;

test("a budget over its limit becomes a question with the user's own figures", () => {
  const prompts = personalPrompts({
    budgets: [
      { category: "dining_out", status: "on_track", remainingCents: 11_662, spentCents: 20_338, limitCents: 32_000 },
      { category: "groceries", status: "over", remainingCents: -6_211, spentCents: 61_211, limitCents: 55_000 },
    ],
    subscriptions: [],
    categoryLabel: label,
  });
  assert.deepEqual(prompts, [{ label: "Over Budget", question: "My Groceries budget is $62.11 over its $550 limit this month. What is going on, and what could I change?" }]);
});

test("the worst budget comes first, and cancelled or bill price rises are not offered", () => {
  const prompts = personalPrompts({
    budgets: [
      { category: "dining_out", status: "over", remainingCents: -1_000, spentCents: 33_000, limitCents: 32_000 },
      { category: "groceries", status: "over", remainingCents: -6_211, spentCents: 61_211, limitCents: 55_000 },
    ],
    subscriptions: [
      { merchant: "City Power", kind: "bill", status: "active", flags: [flag("price_up", { previousCents: 8_285, currentCents: 8_732 })] },
      { merchant: "Old Gym", kind: "subscription", status: "cancelled", flags: [flag("price_up", { previousCents: 1_000, currentCents: 2_000 })] },
      { merchant: "StreamFlix", kind: "subscription", status: "active", flags: [flag("price_up", { previousCents: 1_199, currentCents: 1_549 }), flag("possible_duplicate", { group: "Video Streaming" })] },
    ],
    categoryLabel: label,
  });
  assert.deepEqual(prompts.map((p) => p.label), ["Over Budget", "Price Rise", "Doubled Up"]);
  assert.match(prompts[0]!.question, /Groceries/);
  assert.equal(prompts[1]!.question, "StreamFlix went from $11.99 to $15.49. Is it still worth keeping?");
  assert.equal(prompts[2]!.question, "I pay for more than one Video Streaming service. How do I decide which to keep?");
});

test("with nothing flagged there are no personal prompts, so the page shows only the usual starters", () => {
  assert.deepEqual(personalPrompts({ budgets: [{ category: "groceries", status: "on_track", remainingCents: 100, spentCents: 900, limitCents: 1_000 }], subscriptions: [], categoryLabel: label }), []);
});
