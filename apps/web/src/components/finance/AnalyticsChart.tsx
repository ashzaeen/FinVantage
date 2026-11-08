"use client";

import { formatUsd } from "@finvantage/contracts";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = { month: string; incomeCents: number; spendingCents: number };

export function AnalyticsChart({ data }: { data: TrendPoint[] }) {
  const chartData = data.map((point) => ({
    ...point,
    label: new Date(`${point.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
  }));
  if (chartData.every((point) => point.incomeCents === 0 && point.spendingCents === 0)) {
    return <div className="flex h-64 items-center justify-center text-sm text-[#8d94a8]">Add transactions to see your monthly cash flow.</div>;
  }
  return <div className="h-64 w-full min-w-0 pt-4">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="#edf0f7" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#8d94a8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(value) => formatUsd(Number(value))} tick={{ fill: "#8d94a8", fontSize: 10 }} axisLine={false} tickLine={false} width={62} />
        <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.month ?? ""} formatter={(value, name) => [formatUsd(Number(value)), name === "incomeCents" ? "Income" : "Spending"]} />
        <Legend formatter={(value) => value === "incomeCents" ? "Income" : "Spending"} />
        <Bar dataKey="incomeCents" name="incomeCents" fill="#544af7" radius={[6, 6, 0, 0]} />
        <Bar dataKey="spendingCents" name="spendingCents" fill="#38d2f0" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
