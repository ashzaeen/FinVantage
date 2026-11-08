import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

function ProgressBar({ value, max, color = "var(--accent)", over = false }: { value: number; max: number; color?: string; over?: boolean }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
      <div className="h-2.5 rounded-full transition-all"
        style={{ width: `${pct}%`, background: over ? "var(--critical)" : color }} />
    </div>
  );
}

export default async function SpendingPage() {
  const [budgets, bills, recurring, summary] = await Promise.all([
    api.listBudgets(),
    api.listUpcomingBills(),
    api.listRecurring(),
    api.getSpendingSummary(),
  ]);

  return (
    <>
      <PageHeader title="Spending" />
      <div className="grid gap-5 md:grid-cols-2">
        {/* Budgets */}
        <Card title="Budgets" subtitle="Demo limits · spending totals from your ledger">
          <ul className="space-y-4">
            {budgets.map((budget) => {
              const over = budget.spentCents > budget.limitCents;
              const pct = Math.min(100, Math.round((budget.spentCents / budget.limitCents) * 100));
              return (
                <li key={budget.category}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium" style={{ color: "var(--ink)" }}>{budget.category}</span>
                    <span className="tabular-nums text-xs" style={{ color: over ? "var(--critical)" : "var(--ink-muted)" }}>
                      {formatUsd(budget.spentCents)} / {formatUsd(budget.limitCents)}
                      {over && <span className="ml-1 font-semibold">Over</span>}
                    </span>
                  </div>
                  <ProgressBar value={budget.spentCents} max={budget.limitCents} over={over} />
                  <p className="mt-1 text-right text-xs" style={{ color: over ? "var(--critical)" : "var(--ink-muted)" }}>
                    {pct}%
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Summary */}
        <Card title={`Summary`} subtitle={summary.month}>
          <ul className="space-y-2">
            {summary.categories.map((row) => {
              const isIncrease = row.changeVsPriorMonthCents > 0;
              return (
                <li key={row.category}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "var(--surface-inset)" }}>
                  <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{row.category}</span>
                  <div className="text-right">
                    <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                      {formatUsd(row.spentCents)}
                    </span>
                    <span className="text-xs" style={{ color: isIncrease ? "var(--critical)" : "var(--good)" }}>
                      {isIncrease ? "▲" : "▼"} {formatUsd(Math.abs(row.changeVsPriorMonthCents))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Upcoming bills */}
        <Card title="Upcoming Bills">
          <ul className="space-y-2">
            {bills.map((bill) => (
              <li key={bill.merchant}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-inset)" }}>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                    style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>
                    📅
                  </span>
                  <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{bill.merchant}</span>
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>{bill.nextDate}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Recurring */}
        <Card title="Recurring Charges">
          <ul className="space-y-2">
            {recurring.map((charge) => (
              <li key={charge.merchant}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surface-inset)" }}>
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                    style={{ background: "var(--accent-soft, #eceeff)", color: "var(--accent)" }}>
                    🔄
                  </span>
                  <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{charge.merchant}</span>
                </div>
                <div className="text-right">
                  <span className="block text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                    {formatUsd(charge.amountCents)}
                  </span>
                  <span className="text-xs capitalize" style={{ color: "var(--ink-muted)" }}>{charge.cadence}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
