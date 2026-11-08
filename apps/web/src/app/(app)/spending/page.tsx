import { formatUsd, type RecurringCharge, type SpendingCategory } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { BucketSplit } from "./BucketSplit";
import { BudgetsPanel, CategoryManager, RecentTransactions, RulesPanel } from "./SpendingManager";

const CADENCE_LABEL: Record<RecurringCharge["cadence"], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  semi_monthly: "Twice a Month",
  monthly: "Monthly",
  yearly: "Yearly",
  unknown: "Recurring",
};

function labeler(categories: SpendingCategory[]) {
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return (id: string | null) => (id ? (byId.get(id) ?? id) : "Uncategorized");
}

function ChargeList({ charges, label, showCadence }: { charges: RecurringCharge[]; label: (id: string | null) => string; showCadence: boolean }) {
  if (charges.length === 0) return <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Nothing coming up.</p>;
  return (
    <ul className="space-y-2">
      {charges.map((charge) => (
        <li key={`${charge.accountId}:${charge.merchant}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{charge.merchant}</span>
            <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
              {label(charge.category)} · {charge.source === "bank" ? "From Your Bank" : "Estimated"}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(Math.abs(charge.amountCents))}</span>
            <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{showCadence ? CADENCE_LABEL[charge.cadence] : charge.nextDate}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function SpendingPage() {
  const [buckets, budgets, categories, rules, transactions, bills, recurring, summary] = await Promise.all([
    api.getBucketSummary(),
    api.listBudgets(),
    api.listSpendingCategories(),
    api.listCategoryRules(),
    api.listTransactions({ query: { limit: 25 } }),
    api.listUpcomingBills(),
    api.listRecurring(),
    api.getSpendingSummary(),
  ]);
  const label = labeler(categories);
  const recentSpending = transactions.filter((t) => t.amountCents < 0).slice(0, 12);

  return (
    <>
      <PageHeader title="Spending" />
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <BucketSplit initial={buckets} />
        </div>

        <BudgetsPanel budgets={budgets} categories={categories} />

        <Card title="Summary" subtitle={`${summary.month} · change against last month`}>
          <ul className="space-y-2">
            {summary.categories.map((row) => {
              const isIncrease = row.changeVsPriorMonthCents > 0;
              return (
                <li key={row.category} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
                  <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{label(row.category)}</span>
                  <div className="text-right">
                    <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(row.spentCents)}</span>
                    <span className="text-xs" style={{ color: isIncrease ? "var(--critical)" : "var(--good)" }}>
                      {isIncrease ? "▲" : "▼"} {formatUsd(Math.abs(row.changeVsPriorMonthCents))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <RecentTransactions transactions={recentSpending} categories={categories} />
        <RulesPanel rules={rules} categories={categories} />

        <div className="md:col-span-2">
          <CategoryManager categories={categories} />
        </div>

        <Card title="Upcoming Bills" subtitle="Due in the next 14 days">
          <ChargeList charges={bills} label={label} showCadence={false} />
        </Card>
        <Card title="Recurring Charges">
          <ChargeList charges={recurring} label={label} showCadence />
        </Card>
      </div>
    </>
  );
}
