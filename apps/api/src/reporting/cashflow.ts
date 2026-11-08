import { categoryBucket, categoryLabel, topCategoryId, type Transaction } from "@finvantage/contracts";
import { categoryIdOf } from "../spending/catalog";

export interface MonthCashFlow {
  monthKey: string;
  incomeCents: number;
  spendingCents: number;
  savingsCents: number;
  /** Money out by top-level category label, largest first. */
  categorySpending: { category: string; cents: number }[];
}

/** Moving money between the user's own accounts is neither income nor spending. */
function isTransfer(t: Transaction) {
  const id = categoryIdOf(t);
  return id !== null && topCategoryId(id) === "transfers";
}

/**
 * Income, spending and savings for each month, from transactions. Transfers are left out, so
 * paying a card from checking or moving cash to savings isn't counted as money in or out.
 * Spending is money out in any other category (uncategorized included).
 */
export function monthlyCashFlow(transactions: Transaction[], monthKeys: string[]): MonthCashFlow[] {
  return monthKeys.map((monthKey) => {
    let incomeCents = 0;
    let spendingCents = 0;
    const byCategory = new Map<string, number>();
    for (const t of transactions) {
      if (!t.date.startsWith(monthKey) || isTransfer(t)) continue;
      if (t.amountCents > 0) {
        incomeCents += t.amountCents;
        continue;
      }
      const id = categoryIdOf(t);
      if (categoryBucket(id) === "excluded") continue;
      const cents = Math.abs(t.amountCents);
      spendingCents += cents;
      const label = id ? categoryLabel(topCategoryId(id)) : "Uncategorized";
      byCategory.set(label, (byCategory.get(label) ?? 0) + cents);
    }
    return {
      monthKey,
      incomeCents,
      spendingCents,
      savingsCents: incomeCents - spendingCents,
      categorySpending: [...byCategory].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
    };
  });
}

/**
 * Monthly averages over the months that have any transactions, or with `complete`, only months
 * with both income and spending (a month with a paycheck but no spending yet isn't a typical
 * month to project from). Null when no month qualifies.
 */
export function averageCashFlow(months: MonthCashFlow[], options: { complete?: boolean } = {}) {
  const active = months.filter((m) =>
    options.complete ? m.incomeCents > 0 && m.spendingCents > 0 : m.incomeCents > 0 || m.spendingCents > 0,
  );
  if (active.length === 0) return null;
  const avg = (pick: (m: MonthCashFlow) => number) => Math.round(active.reduce((sum, m) => sum + pick(m), 0) / active.length);
  const incomeCents = avg((m) => m.incomeCents);
  const spendingCents = avg((m) => m.spendingCents);
  return { incomeCents, spendingCents, savingsCents: incomeCents - spendingCents, months: active.length };
}

/** `2026-11` → the `count` month keys before it, oldest first. */
export function monthsBefore(monthKey: string, count: number): string[] {
  const [year, month] = monthKey.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - i), 1));
    return d.toISOString().slice(0, 7);
  });
}
