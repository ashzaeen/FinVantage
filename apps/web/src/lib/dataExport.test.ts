import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account, Transaction } from "@finvantage/contracts";
import { csvCell, transactionsCsv } from "./dataExport";

test("a cell that could run as a formula is made text, and commas and quotes are escaped", () => {
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("Smith, J"), '"Smith, J"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("plain"), "plain");
});

test("transactions export with plain decimal amounts and the account's name", () => {
  const accounts = [{ id: "a1", name: "Checking" }] as Account[];
  const tx = [{ date: "2026-12-01", merchant: "Cafe", category: "dining", subcategory: null, accountId: "a1", amountCents: -1250, currency: "USD", isRecurring: false }] as unknown as Transaction[];
  const lines = transactionsCsv(tx, accounts).trim().split("\r\n");
  assert.equal(lines[1], "2026-12-01,Cafe,dining,Checking,-12.50,USD,no");
});
