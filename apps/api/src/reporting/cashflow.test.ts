import assert from "node:assert/strict";
import { test } from "node:test";
import { Transaction } from "@finvantage/contracts";
import { averageCashFlow, monthlyCashFlow, monthsBefore } from "./cashflow";

let n = 0;
const tx = (date: string, amountCents: number, category: string | null, subcategory: string | null = null) =>
  Transaction.parse({ id: `t${n++}`, accountId: "a1", date, amountCents, merchant: "M", category, subcategory, isRecurring: false });

test("income and spending per month, with transfers left out", () => {
  const [oct, nov] = monthlyCashFlow(
    [
      tx("2026-10-01", 500_000, "income"),
      tx("2026-10-03", -150_000, "housing"),
      tx("2026-10-04", -4_000, "dining_out", "dining_out.coffee"),
      tx("2026-10-05", -2_000, null),
      tx("2026-10-06", -80_000, "transfers", "transfers.credit_card_payment"),
      tx("2026-10-07", 80_000, "transfers"),
      tx("2026-10-08", -1_000, "transfer"), // a pre-redesign id
      tx("2026-11-01", -3_000, "dining_out"),
    ],
    ["2026-10", "2026-11"],
  );
  assert.equal(oct!.incomeCents, 500_000);
  assert.equal(oct!.spendingCents, 156_000);
  assert.equal(oct!.savingsCents, 344_000);
  assert.deepEqual(oct!.categorySpending.map((c) => c.cents), [150_000, 4_000, 2_000]);
  assert.ok(oct!.categorySpending.some((c) => c.category === "Uncategorized"));
  assert.equal(nov!.incomeCents, 0);
  assert.equal(nov!.spendingCents, 3_000);
});

test("averages skip empty months, and are null with no data", () => {
  const months = monthlyCashFlow([tx("2026-07-01", 300_000, "income"), tx("2026-07-02", -100_000, "housing")], ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(averageCashFlow(months), { incomeCents: 300_000, spendingCents: 100_000, savingsCents: 200_000, months: 1 });
  assert.equal(averageCashFlow(monthlyCashFlow([], ["2026-07"])), null);
  // A month with only a paycheck isn't a full month to project from.
  const partial = monthlyCashFlow([tx("2026-10-15", 300_000, "income"), tx("2026-11-02", -5_000, "housing")], ["2026-10", "2026-11"]);
  assert.equal(averageCashFlow(partial, { complete: true }), null);
  assert.equal(averageCashFlow(partial)?.months, 2);
});

test("monthsBefore crosses year boundaries", () => {
  assert.deepEqual(monthsBefore("2026-02", 3), ["2025-11", "2025-12", "2026-01"]);
});
