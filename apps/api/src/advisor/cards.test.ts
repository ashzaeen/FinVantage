import assert from "node:assert/strict";
import { test } from "node:test";
import type { PeriodSummary } from "@finvantage/contracts";
import { CARD_ROWS, listCard, periodCard, rangeLabel, shortDay } from "./cards";

const base: PeriodSummary = {
  from: "2026-10-01",
  to: "2026-10-31",
  kind: "spent",
  totalCents: 123_456,
  count: 14,
  matchedCategories: [],
  byMonth: [{ month: "2026-10", totalCents: 123_456 }],
  byCategory: [
    { categoryId: "food", label: "Food", totalCents: 80_000, count: 9 },
    { categoryId: "shopping", label: "Shopping", totalCents: 43_456, count: 1 },
  ],
  byMerchant: [],
  transactions: [
    { date: "2026-10-04", merchant: "Trader Joe's", amountCents: 9_000, label: "Groceries" },
    { date: "2026-10-09", merchant: "Chipotle", amountCents: 1_500, label: "Dining Out" },
  ],
  truncated: false,
};

test("dates read the way a person says them", () => {
  assert.equal(shortDay("2026-10-01"), "Oct 1");
  assert.equal(rangeLabel("2026-10-01", "2026-10-31"), "Oct 1 to Oct 31, 2026");
  assert.equal(rangeLabel("2025-12-15", "2026-01-15"), "Dec 15, 2025 to Jan 15, 2026");
});

test("an unfiltered period lists categories with the total, labelled by what was totalled", () => {
  const card = periodCard(base);
  assert.equal(card.title, "Spending");
  assert.deepEqual(card.total, { label: "Total Spent", valueCents: 123_456 });
  assert.deepEqual(card.rows.map((r) => [r.label, r.detail, r.valueCents]), [
    ["Food", "9 transactions", 80_000],
    ["Shopping", "1 transaction", 43_456],
  ]);
  assert.equal(card.moreCount, 0);
});

test("a category or merchant filter lists the transactions behind the total and counts the rest", () => {
  const card = periodCard({ ...base, matchedCategories: ["Food", "Groceries"] });
  assert.equal(card.title, "Spending: Food, Groceries");
  assert.deepEqual(card.rows[0], { label: "Trader Joe's", detail: "Oct 4 · Groceries", valueCents: 9_000 });
  assert.equal(card.moreCount, 12); // 14 matched, 2 listed
  assert.equal(periodCard({ ...base, kind: "income" }, "Acme").title, "Income: Acme");
});

test("a long list is cut to the card's size and the cut is counted", () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({ label: `Row ${i}`, valueCents: 100 }));
  const card = listCard({ title: "T", source: "S", total: null, rows });
  assert.equal(card.rows.length, CARD_ROWS);
  assert.equal(card.moreCount, 4);
});
