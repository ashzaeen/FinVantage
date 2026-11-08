"use client";

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
    return <div className="flex min-h-64 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9ddec] text-center">
      <p className="text-sm font-semibold text-[#16192c]">No cash-flow activity yet</p>
      <p className="mt-1 text-xs text-[#8d94a8]">Add transactions to see monthly income and spending.</p>
      <Link href="/transactions" className="mt-3 rounded-xl bg-[#eef1fc] px-4 py-2 text-sm font-semibold text-[#544af7] hover:bg-[#e2e6fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">View Transactions</Link>
    </div>;
  }
  const latest = chartData.at(-1);
  const latestNet = latest ? latest.incomeCents - latest.spendingCents : 0;
  const axisMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 0 }).format(value / 100);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {latest && <div className="mb-2 grid grid-cols-3 gap-2 border-b border-[#edf0f7] pb-3">
      <div><p className="text-[10px] font-medium uppercase tracking-wide text-[#8d94a8]">{latest.fullLabel} income</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-[#16192c]">{formatUsd(latest.incomeCents)}</p></div>
      <div><p className="text-[10px] font-medium uppercase tracking-wide text-[#8d94a8]">Spending</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-[#16192c]">{formatUsd(latest.spendingCents)}</p></div>
      <div><p className="text-[10px] font-medium uppercase tracking-wide text-[#8d94a8]">Net cash flow</p><p className="mt-1 truncate text-sm font-semibold tabular-nums" style={{ color: latestNet >= 0 ? "#0b8f69" : "#ff4d6d" }}>{formatUsd(latestNet)}</p></div>
    </div>}
    <div className="min-h-[420px] w-full min-w-0 flex-1 pt-2" role="img" aria-label="Grouped monthly income and spending for recent months with activity">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={8} barCategoryGap="28%">
          <CartesianGrid stroke="#e8ebf2" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#626981", fontSize: 11 }} axisLine={{ stroke: "#dfe3ec" }} tickLine={false} />
          <YAxis tickFormatter={(value) => axisMoney(Number(value))} tick={{ fill: "#8d94a8", fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""} formatter={(value, name) => [formatUsd(Number(value)), name === "incomeCents" ? "Income" : "Spending"]} contentStyle={{ borderColor: "#e6e9f2", borderRadius: 12, boxShadow: "0 8px 24px rgba(22,25,44,0.12)" }} />
          <ReferenceLine y={0} stroke="#aeb6c5" strokeWidth={1} />
          <Legend verticalAlign="top" align="right" height={30} formatter={(value) => value === "incomeCents" ? "Income" : "Spending"} wrapperStyle={{ fontSize: 11, color: "#626981" }} />
          <Bar dataKey="incomeCents" name="incomeCents" fill="#0b8f69" radius={[5, 5, 0, 0]} maxBarSize={48} />
          <Bar dataKey="spendingCents" name="spendingCents" fill="#d95c6a" radius={[5, 5, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
