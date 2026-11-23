"use client";

import { compactUsd } from "@/lib/format";
import Link from "next/link";
import { formatUsd } from "@finvantage/contracts";
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = { month: string; incomeCents: number; spendingCents: number };

export function AnalyticsChart({ data }: { data: TrendPoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: new Date(`${point.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
    fullLabel: new Date(`${point.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
  })).filter((point) => point.incomeCents !== 0 || point.spendingCents !== 0);
  if (chartData.length === 0) {
    return <div className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong text-center">
      <p className="text-sm font-semibold text-ink">No cash-flow activity yet</p>
      <p className="mt-1 text-xs text-muted">Add transactions to see monthly income and spending.</p>
      <Link href="/transactions" className="mt-3 rounded-xl bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">View Transactions</Link>
    </div>;
  }
  const latest = chartData.at(-1);
  const latestNet = latest ? latest.incomeCents - latest.spendingCents : 0;
  const axisMoney = compactUsd;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {latest && <div className="mb-2 grid grid-cols-3 gap-2 border-b border-line pb-3">
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted">{latest.fullLabel} income</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-ink">{formatUsd(latest.incomeCents)}</p></div>
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Spending</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-ink">{formatUsd(latest.spendingCents)}</p></div>
      <div><p className="text-xs font-medium uppercase tracking-wide text-muted">Net cash flow</p><p className="mt-1 truncate text-sm font-semibold tabular-nums" style={{ color: latestNet >= 0 ? "var(--gain)" : "var(--loss)" }}>{formatUsd(latestNet)}</p></div>
    </div>}
    <div className="min-h-[420px] w-full min-w-0 flex-1 pt-2" role="img" aria-label="Grouped monthly income and spending for recent months with activity">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={3} barCategoryGap="28%">
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--ink-chart)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis tickFormatter={(value) => axisMoney(Number(value))} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""} formatter={(value, name) => [formatUsd(Number(value)), name === "incomeCents" ? "Income" : "Spending"]} contentStyle={{ borderColor: "var(--border)", borderRadius: 12, boxShadow: "var(--shadow-float)" }} />
          <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
          <Legend verticalAlign="top" align="right" height={30} formatter={(value) => <span style={{ color: "var(--ink-chart)" }}>{value === "incomeCents" ? "Income" : "Spending"}</span>} wrapperStyle={{ fontSize: 12, color: "var(--ink-chart)" }} />
          <Bar dataKey="incomeCents" name="incomeCents" fill="var(--flow-in)" radius={[5, 5, 0, 0]} maxBarSize={48} />
          <Bar dataKey="spendingCents" name="spendingCents" fill="var(--flow-out)" radius={[5, 5, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
