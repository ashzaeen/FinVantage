"use client";

import { ASSET_CLASS_LABEL, formatUsd, type InvestmentsOverview, type QuarterlyReport, type SpendingCategory, type SpendingSummary } from "@finvantage/contracts";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { MockedBadge } from "@/components/ui/MockedBadge";

const PIE_COLORS = ["#544af7", "#3f7cac", "#45a181", "#d59a42", "#b66b64", "#8f80b8"];

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 sm:p-6">
      <h2 className="font-poppins text-lg font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function QuarterlyReportCharts({
  reports,
  loading,
  error,
  investments,
  investmentsError,
  currentSpending,
}: {
  reports: QuarterlyReport[];
  loading: boolean;
  error: string | null;
  investments: InvestmentsOverview | null;
  investmentsError: string | null;
  currentSpending: { summary: SpendingSummary; categories: SpendingCategory[] } | null;
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
  const categoryLabels = new Map((currentSpending?.categories ?? []).map((item) => [item.id, item.label]));
  const usingCurrentMonthCategories = categoryData.length === 0 && !!currentSpending?.summary.categories.some((item) => item.spentCents > 0);
  const displayCategories = categoryData.length > 0
    ? categoryData
    : (currentSpending?.summary.categories ?? []).map((item) => ({ category: categoryLabels.get(item.category) ?? item.category, cents: item.spentCents })).filter((item) => item.cents > 0).sort((a, b) => b.cents - a.cents);
  const topCategories = displayCategories.slice(0, 6);
  const otherCategoryCents = displayCategories.slice(6).reduce((sum, item) => sum + item.cents, 0);
  const spendingCategories = otherCategoryCents > 0 ? [...topCategories, { category: "Other categories", cents: otherCategoryCents }] : topCategories;
  const investmentView = investments?.views[0];
  const performance = investmentView?.performance["3M"].points.map((point) => ({
    date: new Date(point.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    portfolio: point.portfolioChangeRate,
    benchmark: point.benchmarkChangeRate,
  })) ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="order-1 min-w-0">
        <ChartPanel title={hasMonthlyData ? "Income and spending by month" : "Quarter financial snapshot"}>
        <p className="mb-3 text-sm text-muted">
          {hasMonthlyData
            ? `Recorded monthly activity for ${latest?.quarter}.`
            : `Saved planning figures for ${latest?.quarter}; no dated transactions were recorded in this period.`}
        </p>
        <div className="h-72" role="img" aria-label="Grouped bars comparing monthly income and spending">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hasMonthlyData ? data : snapshotData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }} barGap={5}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey={hasMonthlyData ? "period" : "metric"} tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} />
              <YAxis tickFormatter={axisFormatter} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} width={48} />
              <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} contentStyle={{ borderColor: "var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(22,25,44,0.12)" }} />
              {hasMonthlyData && <Legend verticalAlign="top" align="right" height={34} iconType="circle" wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }} />}
              {hasMonthlyData ? (
                <>
                  <Bar dataKey="incomeCents" name="Income" fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={34} />
                  <Bar dataKey="spendingCents" name="Spending" fill="var(--series-2)" radius={[5, 5, 0, 0]} maxBarSize={34} />
                </>
              ) : (
                <Bar dataKey="amountCents" name="Monthly amount" fill="var(--accent)" radius={[6, 6, 0, 0]} maxBarSize={56} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
        </ChartPanel>
      </div>

      <div className="order-3 min-w-0 xl:col-span-2">
        <ChartPanel title={hasMonthlyData ? "Monthly savings trend" : "Quarterly spending trend"}>
        <p className="mb-3 text-sm text-muted">
          {hasMonthlyData ? "Income minus recorded spending for each month." : "Saved monthly spending assumptions across report quarters."}
        </p>
        <div className="h-64" role="img" aria-label="Line chart showing monthly savings over time">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hasMonthlyData ? data : trendData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} />
              <YAxis tickFormatter={axisFormatter} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} width={48} />
              <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} contentStyle={{ borderColor: "var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(22,25,44,0.12)" }} />
              <Line
                type="monotone"
                dataKey={hasMonthlyData ? "savingsCents" : "spendingCents"}
                name={hasMonthlyData ? "Savings" : "Spending"}
                stroke="var(--good)"
                strokeWidth={3}
                dot={{ fill: "var(--good)", stroke: "white", strokeWidth: 2, r: 5 }}
                activeDot={{ r: 7, stroke: "white", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        </ChartPanel>
      </div>

      <div className="order-2 min-w-0">
        <ChartPanel title="Spending by category">
        <p className="mb-3 text-sm text-muted">{usingCurrentMonthCategories ? `No category totals were recorded in ${latest?.quarter}; showing ${currentSpending?.summary.month} spending instead.` : `Largest categories in ${latest?.quarter}; values are totaled across the quarter.`}</p>
        {spendingCategories.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center rounded-2xl bg-inset px-6 text-center">
            <p className="text-sm font-semibold text-ink">No category totals are available yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted">Categorize transactions to build a useful spending breakdown.</p>
          </div>
        ) : (
          <div className="h-72" role="img" aria-label="Horizontal bars showing quarterly spending by category">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendingCategories} layout="vertical" margin={{ top: 4, right: 58, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="category" width={112} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} />
                <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} cursor={{ fill: "var(--surface-inset)" }} contentStyle={{ borderColor: "var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(22,25,44,0.12)" }} />
                <Bar dataKey="cents" name="Spent" fill="var(--accent)" radius={[0, 6, 6, 0]} maxBarSize={23}>
                  <LabelList dataKey="cents" position="right" formatter={(value) => typeof value === "number" ? formatUsd(value) : ""} style={{ fill: "var(--ink-secondary)", fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        </ChartPanel>
      </div>

      <div className="order-4 min-w-0 xl:col-span-2">
        <ChartPanel title="Investment snapshot">
          {investmentsError ? (
            <p className="text-sm text-critical">{investmentsError}</p>
          ) : !investmentView || !investments ? (
            <div className="h-52 animate-pulse rounded bg-inset" aria-label="Loading investment snapshot" />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">Current portfolio and trailing three-month performance, as of {investments.pricesAsOf}.</p>
                <MockedBadge />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Portfolio value", value: formatUsd(investmentView.totalValueCents), detail: `Across ${investmentView.accountCount} accounts`, tone: "text-ink" },
                  { label: "Total return", value: formatUsd(investmentView.totalReturnCents), detail: `${(investmentView.totalReturnRate * 100).toFixed(1)}% overall`, tone: investmentView.totalReturnCents >= 0 ? "text-good" : "text-critical" },
                  { label: "Three-month return", value: `${(investmentView.performance["3M"].changeRate * 100).toFixed(1)}%`, detail: `Benchmark ${(investmentView.performance["3M"].benchmarkChangeRate * 100).toFixed(1)}%`, tone: investmentView.performance["3M"].changeRate >= 0 ? "text-good" : "text-critical" },
                  { label: "Cash and dividends", value: formatUsd(investmentView.cashCents), detail: `${formatUsd(investmentView.dividendsYtdCents)} dividends YTD`, tone: "text-ink" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-line p-4">
                    <p className="text-xs text-muted">{stat.label}</p>
                    <p className={`mt-2 font-poppins text-xl font-bold tabular-nums ${stat.tone}`}>{stat.value}</p>
                    <p className="mt-1 text-xs text-muted">{stat.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
                <section className="min-w-0 rounded-2xl border border-line p-4">
                  <h3 className="font-semibold text-ink">Portfolio vs. benchmark</h3>
                  <p className="mt-1 text-xs text-muted">Cumulative return over the last three months.</p>
                  <div className="mt-3 h-60" role="img" aria-label="Three-month investment return compared with benchmark">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={performance} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} />
                        <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} width={42} />
                        <Tooltip formatter={(value) => typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "-"} contentStyle={{ borderColor: "var(--border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(22,25,44,0.12)" }} />
                        <ReferenceLine y={0} stroke="var(--ink-muted)" strokeDasharray="4 4" />
                        <Legend verticalAlign="top" align="right" height={30} iconType="plainline" wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }} />
                        <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke={investmentView.performance["3M"].changeRate >= 0 ? "var(--good)" : "var(--critical)"} strokeWidth={3} dot={{ fill: investmentView.performance["3M"].changeRate >= 0 ? "var(--good)" : "var(--critical)", stroke: "white", strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="min-w-0 rounded-2xl border border-line p-4">
                  <h3 className="font-semibold text-ink">Portfolio allocation</h3>
                  <p className="mt-1 text-xs text-muted">Share of current portfolio value by asset class.</p>
                  {investmentView.allocation.length ? (
                    <div className="flex flex-col items-center gap-3 sm:flex-row xl:flex-col 2xl:flex-row">
                      <div className="h-48 w-full max-w-52 shrink-0" role="img" aria-label="Portfolio allocation by asset class">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={investmentView.allocation} dataKey="valueCents" nameKey="assetClass" innerRadius={55} outerRadius={82} paddingAngle={2}>
                              {investmentView.allocation.map((slice, index) => <Cell key={slice.assetClass} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value) => typeof value === "number" ? formatUsd(value) : "-"} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <ul className="w-full space-y-2">
                        {investmentView.allocation.map((slice, index) => (
                          <li key={slice.assetClass} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-2 text-muted"><i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} /><span className="truncate">{ASSET_CLASS_LABEL[slice.assetClass]}</span></span>
                            <span className="shrink-0 font-medium tabular-nums text-ink">{formatUsd(slice.valueCents)} · {(slice.weight * 100).toFixed(1)}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : <p className="mt-6 text-sm text-muted">No investment allocation is available.</p>}
                </section>
              </div>
            </>
          )}
        </ChartPanel>
      </div>
    </div>
  );
}
