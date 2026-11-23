"use client";

import { formatUsd, type SpendingBreakdownRow, type SpendingCategory } from "@finvantage/contracts";
import { CategoryPie } from "@/components/spending/CategoryPie";

/**
 * This month's spending by category. Money moved to savings and investing is left out of the ring,
 * so its total is the same "spent" figure Overview, Income and Reports quote, and is shown on its
 * own line underneath.
 */
export function SpendingPie({
  month,
  categories,
  breakdown,
  savedCents,
}: {
  month: string;
  categories: SpendingCategory[];
  breakdown: SpendingBreakdownRow[];
  savedCents: number;
}) {
  const savingsIds = new Set(categories.filter((c) => c.bucket === "savings").map((c) => c.id));
  const spendingRows = breakdown.filter((row) => !savingsIds.has(row.categoryId));
  return (
    <CategoryPie
      title="Spending by Category"
      period={new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      totalNote="spent"
      centerLabel="This Month"
      emptyText="No spending yet this month."
      categories={categories}
      breakdown={spendingRows}
      footer={
        <p>
          <span className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(savedCents)}</span> also went to savings and investing, which is saved, not spent.
        </p>
      }
    />
  );
}
