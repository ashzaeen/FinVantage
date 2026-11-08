"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type GoalCount = { label: string; count: number; color: string };

export function GoalsAnalysisChart({ data }: { data: GoalCount[] }) {
  return <section className="rounded-3xl border border-[#edf0f7] bg-white p-6 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
    <div><h2 className="font-poppins text-base font-bold text-[#16192c]">Goals by status</h2><p className="mt-1 text-xs text-[#8d94a8]">Number of goals in each stage</p></div>
    <div className="mt-5 h-72 min-w-0">
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 18, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#edf0f7" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#4a4f68", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} width={32} tick={{ fill: "#8d94a8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => [Number(value), "Goals"]} cursor={{ fill: "#f8f9fe" }} />
        <Bar dataKey="count" name="Goals" radius={[8, 8, 0, 0]} maxBarSize={72}>
          {data.map((item) => <Cell key={item.label} fill={item.color} />)}
        </Bar>
      </BarChart></ResponsiveContainer>
    </div>
    <ul className="grid gap-2 sm:grid-cols-3">{data.map((item) => <li key={item.label} className="flex items-center justify-between rounded-xl bg-[#f8f9fe] px-3 py-2 text-sm"><span className="flex items-center gap-2 text-[#626981]"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.label}</span><strong className="tabular-nums text-[#16192c]">{item.count}</strong></li>)}</ul>
  </section>;
}
