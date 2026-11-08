"use client";

import type { SpendingBreakdownRow, SpendingCategory } from "@finvantage/contracts";
import { CategoryPie } from "@/components/spending/CategoryPie";

/** This month's spending by category. */
export function SpendingPie({ month, categories, breakdown }: { month: string; categories: SpendingCategory[]; breakdown: SpendingBreakdownRow[] }) {
  return (
    <CategoryPie
      title="Spending by Category"
      period={new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      totalNote="spent"
      centerLabel="This Month"
      emptyText="No spending yet this month."
      categories={categories}
      breakdown={breakdown}
    />
  );
}
