"use client";

import { formatUsd, type QuarterlyReport } from "@finvantage/contracts";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";

const PIE_COLORS = ["#544af7", "#38d2f0", "#00c48c", "#ff9900", "#ff4d6d", "#8b5cf6"];

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-6 shadow-[0_4px_20px_-2px_rgba(22,25,44,0.05)]">
      <h2 className="font-poppins text-xl font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function QuarterlyReportCharts({
  reports,
  loading,
  error,
}: {
  reports: QuarterlyReport[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <ChartPanel title="Monthly quarter analysis">
        <div className="h-72 animate-pulse rounded bg-inset" aria-label="Loading report charts" />
      </ChartPanel>
    );
  }
  if (error) {
    return (
      <ChartPanel title="Monthly quarter analysis">
        <p className="text-sm text-critical">{error}</p>
      </ChartPanel>
    );
  }

  const data = [...reports]
    .sort((left, right) => left.quarter.localeCompare(right.quarter))
    .flatMap((report) =>
      report.visuals.monthlyBreakdown.map((month) => ({
        period: `${report.quarter} ${month.month.split(" ")[0]}`,
        metric: `${report.quarter} ${month.month.split(" ")[0]}`,
        incomeCents: month.incomeCents,
        spendingCents: month.spendingCents,
        savingsCents: month.savingsCents,
        amountCents: 0,
      })),
    );
  const axisFormatter = (value: number) => `$${Math.round(value / 100_000)}k`;
  const latest = reports[0];
  const hasMonthlyData = data.some((point) => point.incomeCents !== 0 || point.spendingCents !== 0);
  const snapshotData = latest ? [
    { period: "Income", metric: "Income", incomeCents: 0, spendingCents: 0, savingsCents: 0, amountCents: latest.visuals.summary.monthlyIncomeCents },
    { period: "Spending", metric: "Spending", incomeCents: 0, spendingCents: 0, savingsCents: 0, amountCents: latest.visuals.summary.monthlySpendingCents },
    { period: "Savings", metric: "Savings", incomeCents: 0, spendingCents: 0, savingsCents: 0, amountCents: latest.visuals.summary.monthlySavingsCents },
  ] : [];
  const trendData = latest?.visuals.spendingTrend.map((point) => ({
    period: point.quarter,
    spendingCents: point.monthlySpendingCents,
  })) ?? [];
  const categoryTotals = new Map<string, number>();
  for (const month of latest?.visuals.monthlyBreakdown ?? []) {
    for (const item of month.categorySpending) {
      categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.cents);
    }
  }
  const categoryData = [...categoryTotals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((left, right) => right.cents - left.cents);
  const pieData = categoryData.length > 0
    ? categoryData
    : (latest?.visuals.accountAllocation.map((item) => ({
      category: item.label,
      cents: item.balanceCents,
    })) ?? []);
  const pieUsesSpending = categoryData.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="order-1 min-w-0">
        <ChartPanel title={hasMonthlyData ? "Income and spending by month" : "Quarter financial snapshot"}>
        <p className="mb-4 text-xs text-muted">
          {hasMonthlyData
            ? `Recorded monthly activity for ${latest?.quarter}.`
            : `Saved planning figures for ${latest?.quarter}; no dated transactions were recorded in this period.`}
        </p>
        <div className="h-80" role="img" aria-label="Grouped bars comparing monthly income and spending">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hasMonthlyData ? data : snapshotData} margin={{ top: 8, right: 8, left: 4, bottom: 42 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={hasMonthlyData ? "period" : "metric"} angle={hasMonthlyData ? -35 : 0} textAnchor={hasMonthlyData ? "end" : "middle"} height={62} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} />
              <YAxis tickFormatter={axisFormatter} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} width={48} />
              <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} contentStyle={{ borderColor: "var(--border)", borderRadius: 12 }} />
              {hasMonthlyData ? (
                <>
                  <Bar dataKey="incomeCents" name="Income" fill="var(--accent)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="spendingCents" name="Spending" fill="var(--cyan)" radius={[5, 5, 0, 0]} />
                </>
              ) : (
                <Bar dataKey="amountCents" name="Monthly amount" fill="var(--accent)" radius={[8, 8, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        </ChartPanel>
      </div>

      <div className="order-3 min-w-0 xl:col-span-2">
        <ChartPanel title={hasMonthlyData ? "Monthly savings trend" : "Quarterly spending trend"}>
        <p className="mb-4 text-xs text-muted">
          {hasMonthlyData ? "Income minus recorded spending for each month." : "Saved monthly spending assumptions across report quarters."}
        </p>
        <div className="h-80" role="img" aria-label="Line chart showing monthly savings over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hasMonthlyData ? data : trendData} margin={{ top: 8, right: 18, left: 4, bottom: 42 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" angle={-35} textAnchor="end" height={62} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} />
              <YAxis tickFormatter={axisFormatter} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} width={48} />
              <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} contentStyle={{ borderColor: "var(--border)", borderRadius: 12 }} />
              <Line
                type="monotone"
                dataKey={hasMonthlyData ? "savingsCents" : "spendingCents"}
                name={hasMonthlyData ? "Savings" : "Spending"}
                stroke="var(--good)"
                strokeWidth={3}
                dot={{ fill: "var(--good)", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        </ChartPanel>
      </div>

      <div className="order-2 min-w-0">
        <ChartPanel title={pieUsesSpending ? "Spending by category" : "Account allocation"}>
        <p className="mb-4 text-xs text-muted">
          {pieUsesSpending
            ? `How categories contribute to ${latest?.quarter} spending.`
            : `Current account balances supporting the ${latest?.quarter} report.`}
        </p>
        {pieData.length === 0 ? (
          <div className="flex h-80 items-center justify-center rounded bg-inset px-6 text-center text-sm text-muted">
            No categorized spending is available for this quarter.
          </div>
        ) : (
          <div className="h-80" role="img" aria-label="Pie chart showing quarterly spending by category">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="cents"
                  nameKey="category"
                  cx="50%"
                  cy="46%"
                  innerRadius={54}
                  outerRadius={96}
                  paddingAngle={3}
                  label={({ name }) => String(name)}
                >
                  {pieData.map((item, index) => (
                    <Cell key={item.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        </ChartPanel>
      </div>
    </div>
  );
}
