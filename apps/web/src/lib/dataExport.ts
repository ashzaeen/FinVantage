import type { Account, Goal, Transaction } from "@finvantage/contracts";

/**
 * A spreadsheet can run a cell that starts with one of these as a formula. Merchant and account
 * names come from outside, so a leading quote makes them text.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** A number written as is: a negative amount must stay a number, not become text. */
type Raw = { raw: string };
type Cell = string | Raw;

function csv(header: string[], rows: Cell[][]): string {
  const cell = (c: Cell) => (typeof c === "string" ? csvCell(c) : c.raw);
  return `${[header, ...rows.map((r) => r.map(cell))].map((r) => r.join(",")).join("\r\n")}\r\n`;
}

const dollars = (cents: number): Raw => ({ raw: (cents / 100).toFixed(2) });

export function transactionsCsv(transactions: Transaction[], accounts: Account[]): string {
  const name = new Map(accounts.map((a) => [a.id, a.name]));
  return csv(
    ["Date", "Merchant", "Category", "Account", "Amount", "Currency", "Recurring"],
    transactions.map((t) => [t.date, t.merchant, t.subcategory ?? t.category ?? "", name.get(t.accountId) ?? t.accountId, dollars(t.amountCents), t.currency, t.isRecurring ? "yes" : "no"]),
  );
}

export function accountsCsv(accounts: Account[]): string {
  return csv(["Name", "Type", "Balance"], accounts.map((a) => [a.name, a.type, dollars(a.balanceCents)]));
}

export function goalsCsv(goals: Goal[]): string {
  return csv(
    ["Name", "Target", "Saved", "Target Date", "Priority"],
    goals.map((g) => [g.name, dollars(g.targetCents), dollars(g.currentCents), g.targetDate, { raw: String(g.priorityRank) }]),
  );
}
