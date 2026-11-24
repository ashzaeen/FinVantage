import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChangeRequest, Transaction } from "@finvantage/contracts";
import { applyChange, type ChangeApi } from "./changes";

const base = { accountId: "a", currency: "USD" as const, originalAmountCents: null, exchangeRateToUsd: null, exchangeRateDate: null, isRecurring: false, pending: false, categoryDetailed: null, paymentChannel: null, logoUrl: null };
const tx = (id: string, merchant: string, category: string | null, amountCents = -1_000): Transaction => ({ ...base, id, date: "2026-12-01", merchant, category, subcategory: null, amountCents });

/** A small ledger that behaves like the real routes, so undo is checked against real changes. */
function ledger(initial: Transaction[]) {
  const rows = new Map(initial.map((t) => [t.id, { ...t }]));
  const calls: string[] = [];
  let ruleId = 0;
  const existingRules: Array<{ id: string; merchantContains: string; categoryId: string }> = [];
  const api = {
    listTransactions: async () => [...rows.values()].map((t) => ({ ...t })),
    createCategoryRule: async ({ body }: { body: { merchantContains: string; categoryId: string } }) => {
      let updated = 0;
      for (const t of rows.values()) {
        if (t.merchant.toLowerCase().includes(body.merchantContains.toLowerCase()) && t.category !== body.categoryId) { t.category = body.categoryId; updated++; }
      }
      calls.push("createCategoryRule");
      return { rule: { id: `rule-${++ruleId}` }, updatedTransactions: updated };
    },
    listCategoryRules: async () => existingRules,
    deleteCategoryRule: async ({ params }: { params: { id: string } }) => { calls.push(`deleteCategoryRule ${params.id}`); return { deleted: true }; },
    bulkRecategorizeTransactions: async ({ body }: { body: { ids: string[]; categoryId: string | null } }) => {
      for (const id of body.ids) rows.get(id)!.category = body.categoryId;
      calls.push(`bulk ${body.ids.length}`);
      return { updated: body.ids.length };
    },
    splitTransaction: async ({ params, body }: { params: { id: string }; body: { parts: Array<{ amountCents: number; categoryId: string | null }> } }) => {
      const original = rows.get(params.id)!;
      const out: Transaction[] = [];
      body.parts.forEach((p, i) => {
        if (i === 0) { Object.assign(original, { amountCents: p.amountCents, category: p.categoryId }); out.push({ ...original }); }
        else { const added = { ...original, id: `${params.id}-part${i}`, amountCents: p.amountCents, category: p.categoryId }; rows.set(added.id, added); out.push({ ...added }); }
      });
      return out;
    },
    removeTransaction: async ({ params }: { params: { id: string } }) => { rows.delete(params.id); return { result: "deleted" as const }; },
    updateTransaction: async ({ params, body }: { params: { id: string }; body: Partial<Transaction> }) => { Object.assign(rows.get(params.id)!, body); return rows.get(params.id)!; },
    updateGoal: async ({ params, body }: { params: { id: string }; body: { priorityRank: number } }) => { calls.push(`updateGoal ${params.id} ${body.priorityRank}`); return {}; },
    setBudget: async ({ body }: { body: { category: string; monthlyLimitCents: number } }) => { calls.push(`setBudget ${body.category} ${body.monthlyLimitCents}`); return {}; },
    deleteBudget: async ({ params }: { params: { category: string } }) => { calls.push(`deleteBudget ${params.category}`); return {}; },
    updateAccount: async ({ body }: { body: { annualRate: number | null } }) => { calls.push(`updateAccount ${body.annualRate}`); return {}; },
  } as unknown as ChangeApi;
  return { api, rows, calls, existingRules, snapshot: () => [...rows.values()].map((t) => `${t.id}:${t.category}:${t.amountCents}`).sort() };
}

test("a category rule is undone exactly: only the transactions it moved go back, to where each came from", async () => {
  const l = ledger([tx("1", "StreamFlix", "entertainment"), tx("2", "StreamFlix", "shopping"), tx("3", "StreamFlix", "groceries"), tx("4", "Other Shop", "shopping")]);
  const before = l.snapshot();
  const applied = await applyChange(l.api, { action: "create_category_rule", body: { merchantContains: "StreamFlix", categoryId: "groceries", applyToPast: true } });
  assert.deepEqual(l.snapshot(), ["1:groceries:-1000", "2:groceries:-1000", "3:groceries:-1000", "4:shopping:-1000"]);
  await applied.undo!();
  assert.deepEqual(l.snapshot(), before, "every row is back, and the one already in groceries was never touched");
  assert.ok(l.calls.includes("deleteCategoryRule rule-1"), "the rule itself is removed");
});

test("a bulk move is undone to each transaction's own previous category", async () => {
  const l = ledger([tx("1", "Uber", "dining"), tx("2", "Uber", "shopping"), tx("3", "Uber", "dining")]);
  const before = l.snapshot();
  const request: ChangeRequest = { action: "bulk_recategorize", categoryId: "transport", previous: [{ categoryId: "dining", ids: ["1", "3"] }, { categoryId: "shopping", ids: ["2"] }] };
  const applied = await applyChange(l.api, request);
  assert.ok([...l.rows.values()].every((t) => t.category === "transport"));
  await applied.undo!();
  assert.deepEqual(l.snapshot(), before);
});

test("a split is undone by deleting the new parts and restoring the original", async () => {
  const original = tx("1", "Costco", "shopping", -8_000);
  const l = ledger([original]);
  const previous = { accountId: "a", date: "2026-12-01", amountCents: -8_000, currency: "USD" as const, merchant: "Costco", subcategory: null, pending: false, categoryDetailed: null, paymentChannel: null, logoUrl: null, category: "shopping", isRecurring: false };
  const applied = await applyChange(l.api, {
    action: "split_transaction", id: "1", previous,
    parts: [{ amountCents: -5_000, categoryId: "groceries" }, { amountCents: -3_000, categoryId: "household" }],
  });
  assert.equal(l.rows.size, 2);
  assert.equal(l.rows.get("1")!.amountCents, -5_000);
  await applied.undo!();
  assert.equal(l.rows.size, 1, "the added part is gone");
  assert.deepEqual(l.snapshot(), ["1:shopping:-8000"], "the original is whole again");
});

test("several goals or budgets change together and each goes back as it was", async () => {
  const l = ledger([]);
  const goal = (rank: number) => ({ name: "G", targetCents: 100, currentCents: 0, targetDate: "2027-01-01", priorityRank: rank, flexibility: "flexible" as const, linkedAccountId: null });
  const reorder = await applyChange(l.api, { action: "reorder_goals", changes: [{ id: "g1", body: goal(1), previous: goal(2) }, { id: "g2", body: goal(2), previous: goal(1) }] });
  await reorder.undo!();
  assert.deepEqual(l.calls, ["updateGoal g1 1", "updateGoal g2 2", "updateGoal g1 2", "updateGoal g2 1"]);

  l.calls.length = 0;
  const budgets = await applyChange(l.api, {
    action: "set_budgets",
    changes: [
      { body: { category: "dining", monthlyLimitCents: 40_000 }, previous: { category: "dining", monthlyLimitCents: 30_000 } },
      { body: { category: "travel", monthlyLimitCents: 10_000 }, previous: null },
    ],
  });
  await budgets.undo!();
  assert.deepEqual(l.calls, ["setBudget dining 40000", "setBudget travel 10000", "setBudget dining 30000", "deleteBudget travel"]);
});

test("a rule that replaced an older one for the same merchant puts that one back when undone", async () => {
  const l = ledger([tx("1", "StreamFlix", "entertainment")]);
  l.existingRules.push({ id: "old", merchantContains: "streamflix", categoryId: "entertainment" });
  const applied = await applyChange(l.api, { action: "create_category_rule", body: { merchantContains: "StreamFlix", categoryId: "groceries", applyToPast: true } });
  l.calls.length = 0;
  await applied.undo!();
  assert.deepEqual(l.calls.filter((c) => c.startsWith("deleteCategoryRule") || c === "createCategoryRule"), ["deleteCategoryRule rule-1", "createCategoryRule"], "the new rule goes, and the old one is made again");
});
