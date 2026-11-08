import { formatUsd, type RecurringCharge, type SpendingCategory, type Transaction } from "@finvantage/contracts";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { BucketSplit } from "./BucketSplit";
import { ManageTools } from "./ManageTools";
import { SpendingPie } from "./SpendingPie";
import { BudgetsPanel } from "./SpendingManager";

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
          <span className="flex min-w-0 items-center gap-3">
            <CategoryIcon id={charge.category} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{charge.merchant}</span>
              <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                {label(charge.category)} · {charge.source === "bank" ? "From Your Bank" : "Estimated"}
              </span>
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

/** Ranks 1 to 5 in the left column and 6 to 10 in the right. */
function TopExpenses({ expenses, label }: { expenses: Transaction[]; label: (id: string | null) => string }) {
  const columns = [expenses.slice(0, 5), expenses.slice(5, 10)];
  return (
    <Card title="Top 10 Expenses" subtitle="This month's largest purchases">
      {expenses.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No purchases yet this month.</p>
      ) : (
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {columns.map((column, c) => (
            <ol key={c} className="space-y-2">
              {column.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--ink-muted)" }}>{c * 5 + i + 1}</span>
                    <CategoryIcon id={t.subcategory ?? t.category} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{t.merchant}</span>
                      <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{label(t.subcategory ?? t.category)} · {t.date}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(Math.abs(t.amountCents))}</span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function SpendingPage() {
  const [buckets, budgets, categories, rules, transactions, bills, recurring, summary, topExpenses, breakdown] = await Promise.all([
    api.getBucketSummary(),
    api.listBudgets(),
    api.listSpendingCategories(),
    api.listCategoryRules(),
    api.listTransactions({ query: { limit: 25 } }),
    api.listUpcomingBills(),
    api.listRecurring(),
    api.getSpendingSummary(),
    api.listTopExpenses({ query: { limit: 10 } }),
    api.getSpendingBreakdown(),
  ]);
  const label = labeler(categories);
  const recentSpending = transactions.filter((t) => t.amountCents < 0).slice(0, 12);

  return (
    <>
      <PageHeader title="Spending" action={<ManageTools categories={categories} rules={rules} transactions={recentSpending} />} />
      <div className="grid gap-5 md:grid-cols-2">
        <BucketSplit initial={buckets} />
        <SpendingPie month={summary.month} categories={categories} breakdown={breakdown} />

        <BudgetsPanel budgets={budgets} categories={categories} />

        <Card title="Summary" subtitle={`${summary.month} · change against last month`}>
          <ul className="space-y-2">
            {summary.categories.map((row) => {
              const isIncrease = row.changeVsPriorMonthCents > 0;
              return (
                <li key={row.category} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
                  <span className="flex items-center gap-3 text-sm font-medium" style={{ color: "var(--ink)" }}>
                    <CategoryIcon id={row.category} />
                    {label(row.category)}
                  </span>
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

        <div className="md:col-span-2">
          <TopExpenses expenses={topExpenses} label={label} />
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
