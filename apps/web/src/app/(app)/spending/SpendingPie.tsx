"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";

/** The dataviz skill's validated categorical order. Slots are assigned by rank, biggest first. */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const MAX_SLICES = SERIES.length;

interface Slice {
  id: string;
  label: string;
  cents: number;
}

/** This month's spending by category. Past seven categories, the rest fold into Other. */
export function SpendingPie({ month, categories }: { month: string; categories: Slice[] }) {
  const sorted = categories.filter((c) => c.cents > 0).sort((a, b) => b.cents - a.cents);
  const slices =
    sorted.length > MAX_SLICES
      ? [...sorted.slice(0, MAX_SLICES - 1), { id: "other", label: "Other", cents: sorted.slice(MAX_SLICES - 1).reduce((sum, c) => sum + c.cents, 0) }]
      : sorted;
  const total = slices.reduce((sum, s) => sum + s.cents, 0);

  return (
    <Card title="Spending by Category" subtitle={`${month} · ${formatUsd(total)} so far`}>
      {slices.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--ink-muted)" }}>No spending yet this month.</p>
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(170px,0.9fr)_1.1fr]">
          <div className="h-52 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="cents" nameKey="label" innerRadius="58%" outerRadius="92%" stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>
                  {slices.map((s, i) => <Cell key={s.id} fill={SERIES[i]} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [formatUsd(Number(value)), String(name)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2">
            {slices.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[i] }} />
                  <span className="truncate" style={{ color: "var(--ink-secondary)" }}>{s.label}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(s.cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
