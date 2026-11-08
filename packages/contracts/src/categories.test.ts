import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SPENDING_CATEGORIES,
  PLAID_DETAILED_CATEGORIES,
  SpendingSplit,
  categorizePlaid,
  categoryBucket,
  categoryLabel,
} from "./categories";

const ids = new Set(DEFAULT_SPENDING_CATEGORIES.map((c) => c.id));

test("every Plaid category, v2 and v1, maps to a category that exists", () => {
  assert.ok(PLAID_DETAILED_CATEGORIES.length >= 127);
  for (const pfc of PLAID_DETAILED_CATEGORIES) {
    const { category, subcategory } = categorizePlaid(pfc);
    assert.ok(category && ids.has(category), `${pfc.detailed} -> ${category}`);
    if (subcategory) assert.ok(ids.has(subcategory) && subcategory.startsWith(`${category}.`), `${pfc.detailed} -> ${subcategory}`);
  }
});

test("subcategories sit under a real parent and share its bucket", () => {
  for (const c of DEFAULT_SPENDING_CATEGORIES.filter((c) => c.parentId)) {
    const parent = DEFAULT_SPENDING_CATEGORIES.find((p) => p.id === c.parentId);
    assert.ok(parent && parent.parentId === null, c.id);
    assert.equal(c.bucket, parent.bucket, c.id);
  }
});

test("credit card payments are transfers, not spending", () => {
  const { category } = categorizePlaid({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" });
  assert.equal(category, "transfers");
  assert.equal(categoryBucket(category), "excluded");
});

test("debt payments are one Needs category, and mortgages count as housing", () => {
  assert.equal(categorizePlaid({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT" }).category, "debt_payments");
  assert.equal(categoryBucket("debt_payments"), "needs");
  assert.equal(categorizePlaid({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" }).subcategory, "housing.mortgage");
});

test("labels are Title Case and unknown ids pass through", () => {
  assert.equal(categoryLabel("dining_out.coffee"), "Coffee");
  assert.equal(categoryLabel("childcare_education"), "Childcare & Education");
  assert.equal(categoryLabel(null), "Uncategorized");
  assert.equal(categoryLabel("custom:walmart"), "custom:walmart");
});

test("category ids from before the redesign still resolve", () => {
  assert.equal(categoryLabel("dining"), "Dining Out");
  assert.equal(categoryBucket("transfer"), "excluded");
  assert.equal(categoryBucket("debt"), "needs");
});

test("a split must add up to 100%", () => {
  assert.ok(SpendingSplit.safeParse({ needs: 0.6, wants: 0.2, savings: 0.2 }).success);
  assert.equal(SpendingSplit.safeParse({ needs: 0.5, wants: 0.3, savings: 0.3 }).success, false);
});
