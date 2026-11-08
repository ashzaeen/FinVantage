"use client";

import { formatUsd } from "@finvantage/contracts";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Bar, BarChart, CartesianGrid, XAxis, YAxis, Line, LineChart, Legend } from "recharts";

const COLORS = ["#5b5fc7", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];
type Holding = { symbol: string; name: string; valueCents: number };

export function PortfolioCharts({ holdings, benchmark }: { holdings: Holding[]; benchmark: { date: string; portfolio: number; benchmark: number }[] }) {
  const total = holdings.reduce((sum, holding) => sum + holding.valueCents, 0);
  const data = holdings.map((holding) => ({ ...holding, value: holding.valueCents }));
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="rounded-3xl border border-[#edf0f7] bg-white p-6 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
      <h2 className="font-poppins text-base font-bold text-[#16192c]">Investment allocation</h2>
      <p className="mt-1 text-xs text-[#8d94a8]">Share of total portfolio value</p>
      {holdings.length ? <div className="mt-4 grid items-center gap-4 sm:grid-cols-[minmax(200px,0.9fr)_1.1fr]">
        <div className="relative h-56 min-w-0">
          <ResponsiveContainer width="100%" height="100%"><PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={3} stroke="none">
              {data.map((entry, index) => <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => formatUsd(Number(value))} />
          </PieChart></ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-[#8d94a8]">Total value</span><strong className="mt-1 font-poppins text-xl text-[#16192c]">{formatUsd(total)}</strong></div>
        </div>
        <ul className="space-y-3">{data.map((holding, index) => <li key={holding.symbol} className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><span className="truncate text-[#4a4f68]">{holding.name}</span></span><span className="shrink-0 font-semibold tabular-nums text-[#16192c]">{total ? Math.round(holding.value / total * 100) : 0}%</span></li>)}</ul>
      </div> : <p className="py-16 text-center text-sm text-[#8d94a8]">No holdings available.</p>}
    </section>
    <section className="rounded-3xl border border-[#edf0f7] bg-white p-6 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
      <h2 className="font-poppins text-base font-bold text-[#16192c]">Value by holding</h2>
      <p className="mt-1 text-xs text-[#8d94a8]">Current value in your portfolio</p>
      {holdings.length ? <div className="mt-5 h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="#edf0f7" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => formatUsd(Number(value))} tick={{ fill: "#8d94a8", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="symbol" width={54} tick={{ fill: "#4a4f68", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => formatUsd(Number(value))} cursor={{ fill: "#f8f9fe" }} />
          <Bar dataKey="value" name="Value" radius={[0, 8, 8, 0]} barSize={22}>{data.map((entry, index) => <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} />)}</Bar>
        </BarChart></ResponsiveContainer>
      </div> : <p className="py-16 text-center text-sm text-[#8d94a8]">No holdings available.</p>}
    </section>
    <section className="rounded-3xl border border-[#edf0f7] bg-white p-6 shadow-[0_2px_12px_rgba(22,25,44,0.03)] xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-poppins text-base font-bold text-[#16192c]">Investment performance</h2><p className="mt-1 text-xs text-[#8d94a8]">Indexed comparison over time · starting value = 100</p></div><span className="rounded-full bg-[#fff5e6] px-3 py-1 text-xs font-semibold text-[#9a5b00]">Mock data</span></div>
      {benchmark.length ? <div className="mt-5 h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={benchmark} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#edf0f7" strokeDasharray="4 4" />
        <XAxis dataKey="date" tickFormatter={(date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} tick={{ fill: "#8d94a8", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: "#8d94a8", fontSize: 11 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip labelFormatter={(date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })} formatter={(value, name) => [Number(value).toFixed(1), name === "portfolio" ? "Portfolio" : "Benchmark"]} />
        <Legend formatter={(value) => value === "portfolio" ? "Portfolio" : "Benchmark"} />
        <Line type="monotone" dataKey="portfolio" name="portfolio" stroke="#544af7" strokeWidth={3} dot={{ r: 4, fill: "#544af7" }} activeDot={{ r: 6 }} />
        <Line type="monotone" dataKey="benchmark" name="benchmark" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} activeDot={{ r: 6 }} />
      </LineChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-[#8d94a8]">No performance history available.</p>}
    </section>
  </div>;
}
