"use client";

import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatUsd, INVESTMENT_RANGES, type InvestmentRange, type InvestmentView, type PerformancePoint } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { Change, Pills, signedPercent, signedUsd, directionClass } from "./parts";

const RANGE_OPTIONS = INVESTMENT_RANGES.map((range) => ({ value: range, label: range === "ALL" ? "All" : range }));

const RANGE_PHRASE: Record<InvestmentRange, string> = {
  "1D": "Last Session",
  "1W": "Past Week",
  "1M": "Past Month",
  "3M": "Past 3 Months",
  YTD: "Year to Date",
  "1Y": "Past Year",
  ALL: "Past 3 Years",
};

const isIntraday = (range: InvestmentRange) => range === "1D" || range === "1W";
const parseAt = (at: string) => new Date(at.length === 10 ? `${at}T00:00:00` : `${at}:00`);

function tickLabel(at: string, range: InvestmentRange): string {
  const date = parseAt(at);
  if (range === "1D") return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (range === "1Y" || range === "ALL") return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fullLabel(at: string, range: InvestmentRange): string {
  const date = parseAt(at);
  return isIntraday(range)
    ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ChartTooltip({ point, range }: { point: PerformancePoint | undefined; range: InvestmentRange }) {
  if (!point) return null;
  return (
    <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg">
      <p className="text-subtle">{fullLabel(point.at, range)}</p>
      <p className="mt-0.5 font-poppins text-sm font-bold tabular-nums">{formatUsd(point.valueCents)}</p>
      <p className="mt-1 flex justify-between gap-4 tabular-nums"><span className="text-subtle">Portfolio</span>{signedPercent(point.portfolioChangeRate)}</p>
      <p className="flex justify-between gap-4 tabular-nums"><span className="text-subtle">S&amp;P 500</span>{signedPercent(point.benchmarkChangeRate)}</p>
    </div>
  );
}

function LegendItem({ label, rate, dashed }: { label: string; rate: number; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-secondary">
      <svg width="18" height="4" aria-hidden="true">
        <line x1="0" x2="18" y1="2" y2="2" stroke={dashed ? "var(--series-2)" : "var(--series-1)"} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
      <span className="font-semibold tabular-nums text-ink">{signedPercent(rate)}</span>
    </span>
  );
}

export function PerformanceCard({ view }: { view: InvestmentView }) {
  const [range, setRange] = useState<InvestmentRange>("1M");
  const performance = view.performance[range];
  const weekTicks = range === "1W" ? performance.points.filter((p) => p.at.endsWith("T10:00")).map((p) => p.at) : undefined;

  return (
    <Card noPad className="invest-rise invest-rise-4">
      <div className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-poppins text-base font-bold text-ink">Performance</h2>
          <p className="text-xs text-muted">How today&apos;s holdings moved over this period</p>
        </div>
        <Pills options={RANGE_OPTIONS} value={range} onChange={setRange} label="Chart Range" compact />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <p className={`font-poppins text-xl font-bold tabular-nums ${directionClass(performance.changeCents)}`}>{signedUsd(performance.changeCents)}</p>
          <p className="text-xs text-muted"><Change rate={performance.changeRate} /> <span className="ml-1">{RANGE_PHRASE[range]}</span></p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <LegendItem label="Portfolio" rate={performance.changeRate} />
          <LegendItem label="S&P 500" rate={performance.benchmarkChangeRate} dashed />
        </div>
      </div>

      {/* Follows the window's height, so the first screen fits a laptop without scrolling. */}
      <div className="mt-2 h-[clamp(170px,32vh,250px)] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={`${view.id}-${range}`} data={performance.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="investFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="at"
              ticks={weekTicks}
              tickFormatter={(at: string) => tickLabel(at, range)}
              tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(rate: number) => `${(rate * 100).toFixed(rate !== 0 && Math.abs(rate) < 0.01 ? 1 : 0)}%`}
              tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <ReferenceLine y={0} stroke="var(--ink-light)" strokeDasharray="3 5" />
            <Tooltip
              cursor={{ stroke: "var(--ink-light)", strokeDasharray: "3 3" }}
              content={(props) => <ChartTooltip point={props.payload?.[0]?.payload as PerformancePoint | undefined} range={range} />}
            />
            <Area type="monotone" dataKey="portfolioChangeRate" name="Portfolio" stroke="var(--series-1)" strokeWidth={2.5} fill="url(#investFill)" baseValue="dataMin" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-card)" }} animationDuration={700} animationEasing="ease-out" />
            <Line type="monotone" dataKey="benchmarkChangeRate" name="S&P 500" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-card)" }} animationDuration={700} animationEasing="ease-out" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* The wrapper does the hiding: browsers ignore width and overflow on a table itself. */}
      <div className="sr-only">
      <table>
        <caption>Portfolio value and change against the S&amp;P 500, {RANGE_PHRASE[range]}</caption>
        <thead><tr><th>Time</th><th>Value</th><th>Portfolio Change</th><th>S&amp;P 500 Change</th></tr></thead>
        <tbody>
          {performance.points.map((point) => (
            <tr key={point.at}><td>{fullLabel(point.at, range)}</td><td>{formatUsd(point.valueCents)}</td><td>{signedPercent(point.portfolioChangeRate)}</td><td>{signedPercent(point.benchmarkChangeRate)}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
      </div>
    </Card>
  );
}
