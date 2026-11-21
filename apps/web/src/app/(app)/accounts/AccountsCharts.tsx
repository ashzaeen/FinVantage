"use client";

import { ACCOUNT_CATEGORY_LABEL, formatUsd, type NetWorth } from "@finvantage/contracts";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AccountsCharts({ netWorth }: { netWorth: NetWorth }) {
  const trend = netWorth.history.map((point) => ({ ...point, value: point.netWorthCents }));
  const breakdown = netWorth.byCategory.map((item) => ({ ...item, label: ACCOUNT_CATEGORY_LABEL[item.category], value: item.balanceCents }));

  return <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
    <section className="rounded-3xl border border-line bg-white p-6 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
      <h2 className="font-poppins text-base font-bold text-ink">Net Worth Over Time</h2>
      <p className="mt-1 text-xs text-muted">Reconstructed from today’s account balances and recorded transactions.</p>
      {trend.length ? <div className="mt-5 h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis dataKey="date" tickFormatter={(date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" })} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(value) => formatUsd(Number(value))} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={76} />
          <Tooltip labelFormatter={(date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} formatter={(value) => [formatUsd(Number(value)), "Net worth"]} />
          <Line type="monotone" dataKey="value" name="Net worth" stroke="var(--accent)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
        </LineChart></ResponsiveContainer>
      </div> : <p className="py-16 text-center text-sm text-muted">No account history yet.</p>}
      <p className="mt-2 text-[11px] leading-4 text-muted">Past values are estimates based on transactions recorded here; missing activity or older statements may change the trend.</p>
    </section>

    <section className="rounded-3xl border border-line bg-white p-6 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
      <h2 className="font-poppins text-base font-bold text-ink">Balance by Account Type</h2>
      <p className="mt-1 text-xs text-muted">Assets are positive and liabilities are negative.</p>
      {breakdown.length ? <div className="mt-5 h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={breakdown} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => formatUsd(Number(value))} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={116} tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => formatUsd(Number(value))} cursor={{ fill: "var(--surface)" }} />
          <Bar dataKey="value" name="Net balance" radius={[0, 6, 6, 0]} barSize={18}>
            {breakdown.map((item) => <Cell key={item.category} fill={item.value >= 0 ? "var(--good)" : "var(--critical)"} />)}
          </Bar>
        </BarChart></ResponsiveContainer>
      </div> : <p className="py-16 text-center text-sm text-muted">Add accounts to see a balance breakdown.</p>}
      {breakdown.length > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-chart"><span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--good)" }} />Assets</span><span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--critical)" }} />Liabilities</span></div>}
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">{breakdown.map((item) => <li key={item.category} className="flex items-center justify-between gap-2 text-ink-chart"><span>{item.label}</span><strong className="tabular-nums text-ink">{formatUsd(item.balanceCents)}</strong></li>)}</ul>
    </section>
  </div>;
}
