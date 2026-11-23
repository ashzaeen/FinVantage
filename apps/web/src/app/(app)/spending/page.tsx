import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatUsd, type SpendingCategory, type Transaction } from "@finvantage/contracts";
import { Sparkline } from "@/components/charts/Sparkline";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { SpendingPatternsCard } from "@/components/spending/SpendingPatternsCard";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { BucketSplit } from "./BucketSplit";
import { ManageTools } from "./ManageTools";
import { SpendingPie } from "./SpendingPie";
import { BudgetsPanel } from "./SpendingManager";
import { BudgetSuggestions } from "./BudgetSuggestions";
import { PaceChart } from "./PaceChart";
import { longDate, monthYear } from "@/lib/format";

function labeler(categories: SpendingCategory[]) {
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return (id: string | null) => (id ? (byId.get(id) ?? id) : "Uncategorized");
}

/** Ranks 1 to 5 in the left column and 6 to 10 in the right. */
function TopExpenses({ expenses, label }: { expenses: Transaction[]; label: (id: string | null) => string }) {
  const columns = [expenses.slice(0, 5), expenses.slice(5, 10)];
  return (
    <Card title="Top 10 Purchases" subtitle="This month's largest purchases, not bills or savings">
      {expenses.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No purchases yet this month.</p>
      ) : (
        <div className={`grid grid-cols-1 gap-x-8 gap-y-2 ${expenses.length > 5 ? "md:grid-cols-2" : ""}`}>
          {columns.map((column, c) => (
            <ol key={c} className="space-y-2">
              {column.map((t, i) => (
                <li key={t.id} className="tile-lift flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--ink-muted)" }}>{c * 5 + i + 1}</span>
                    <CategoryIcon id={t.subcategory ?? t.category} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{t.merchant}</span>
                      <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{label(t.subcategory ?? t.category)} · {longDate(t.date)}</span>
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
  const [buckets, budgets, categories, rules, transactions, summary, topExpenses, breakdown, patterns, pace, suggestions] = await Promise.all([
    api.getBucketSummary(),
    api.listBudgets(),
    api.listSpendingCategories(),
    api.listCategoryRules(),
    api.listTransactions({ query: { limit: 25 } }),
    api.getSpendingSummary(),
    api.listTopExpenses({ query: { limit: 10, kind: "purchases" } }),
    api.getSpendingBreakdown(),
    // A card, not the page: if this fails, the rest still shows.
    api.getSpendingPatterns({ query: {} }).catch(() => null),
    api.getSpendingPace().catch(() => null),
    api.listBudgetSuggestions().catch(() => []),
  ]);
  const label = labeler(categories);
  const recentSpending = transactions.filter((t) => t.amountCents < 0).slice(0, 12);
  // Saving is not spending, and a row that did not move says nothing: show what changed, biggest first.
  const savingsIds = new Set(categories.filter((c) => c.bucket === "savings").map((c) => c.id));
  const changedRows = summary.categories
    .filter((row) => row.changeVsPriorMonthCents !== 0 && !savingsIds.has(row.category))
    .sort((a, b) => Math.abs(b.changeVsPriorMonthCents) - Math.abs(a.changeVsPriorMonthCents));

  return (
    <>
      <PageHeader title="Spending" action={<ManageTools categories={categories} rules={rules} transactions={recentSpending} />} />
      <div className="page-cascade grid grid-cols-1 gap-5 md:grid-cols-2">
        <BucketSplit initial={buckets} />
        <SpendingPie month={summary.month} categories={categories} breakdown={breakdown} savedCents={summary.savedCents} />

        <BudgetsPanel budgets={budgets} categories={categories} />

        {/* Pace and suggestions stack beside the tall Budgets card, so neither column is left with a hole. */}
        <div className="space-y-5">
          {pace && pace.thisMonthCents.length > 1 ? <PaceChart pace={pace} /> : null}
          {suggestions.length > 0 && <BudgetSuggestions suggestions={suggestions} labels={Object.fromEntries(categories.map((c) => [c.id, c.label]))} />}
        </div>

        <Card className="md:col-span-2" title="Changes From Last Month" subtitle={`${monthYear(summary.month)} · change against last month, and the last six months`}>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {changedRows.map((row, i) => {
              const isIncrease = row.changeVsPriorMonthCents > 0;
              return (
                <li key={row.category} className="row-cascade tile-lift flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)", "--i": i } as CSSProperties}>
                  <span className="flex items-center gap-3 text-sm font-medium" style={{ color: "var(--ink)" }}>
                    <CategoryIcon id={row.category} />
                    {label(row.category)}
                  </span>
                  {(summary.categoryTrend[row.category]?.length ?? 0) > 1 && (
                    <span className="ml-auto hidden sm:block">
                      <Sparkline
                        values={summary.categoryTrend[row.category]!}
                        width={64}
                        height={22}
                        label={`${label(row.category)} over the last six months: ${summary.categoryTrend[row.category]!.map((c) => formatUsd(c)).join(", ")}`}
                        color="var(--series-1)"
                      />
                    </span>
                  )}
                  <div className="text-right">
                    <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}><CountUp value={row.spentCents} /></span>
                    <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: isIncrease ? "var(--loss)" : "var(--gain)" }}>
                      {isIncrease ? <ArrowUpRight size={12} strokeWidth={2.6} aria-hidden="true" /> : <ArrowDownRight size={12} strokeWidth={2.6} aria-hidden="true" />} {formatUsd(Math.abs(row.changeVsPriorMonthCents))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {patterns && <div className="md:col-span-2"><SpendingPatternsCard patterns={patterns} /></div>}

        <div className="md:col-span-2">
          <TopExpenses expenses={topExpenses} label={label} />
        </div>

        <Link
          href="/subscriptions"
          className="card-lift flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-raised p-5 text-sm md:col-span-2"
        >
          <span>
            <span className="block font-poppins text-base font-bold text-ink">Bills and Recurring Charges</span>
            <span className="mt-0.5 block text-muted">What is due soon, and every charge that repeats, now lives in Subscriptions.</span>
          </span>
          <span className="font-semibold text-accent-ink">Open Subscriptions ›</span>
        </Link>
      </div>
    </>
  );
}
