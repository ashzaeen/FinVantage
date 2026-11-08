"use client";

import {
  ASSET_CLASS_LABEL,
  formatUsd,
  type InvestmentsOverview,
  type NetWorth,
  type SpendingCategory,
  type SpendingSummary,
} from "@finvantage/contracts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
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

const CHART_COLORS = ["#544af7", "#3f7cac", "#45a181", "#d59a42", "#b66b64", "#8f80b8", "#728196"];
const currency = (cents: number) => formatUsd(cents);
const compactCurrency = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

function ChartPanel({ title, detail, children, className = "" }: { title: string; detail: string; children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-3xl border border-[#edf0f7] bg-white p-5 sm:p-6 ${className}`}>
    <div className="mb-4"><h2 className="font-poppins text-lg font-bold text-[#16192c]">{title}</h2><p className="mt-1 text-xs text-[#8d94a8]">{detail}</p></div>
    {children}
  </section>;
}

const chartTooltipStyle = { borderColor: "#e6e9f2", borderRadius: 12, boxShadow: "0 8px 24px rgba(22,25,44,0.12)" };

export function OverviewCharts({ netWorth, spending, categories, investments }: {
  netWorth: NetWorth;
  spending: SpendingSummary;
  categories: SpendingCategory[];
  investments: InvestmentsOverview;
}) {
  const categoryLabel = new Map(categories.map((category) => [category.id, category.label]));
  const netWorthTrend = [...netWorth.history].sort((a, b) => a.date.localeCompare(b.date)).map((point) => ({
    date: point.date,
    month: new Date(`${point.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
    value: point.netWorthCents,
  }));
  const spendingCategories = [...spending.categories]
    .filter((item) => item.spentCents > 0)
    .sort((a, b) => b.spentCents - a.spentCents)
    .slice(0, 7)
    .map((item) => ({ name: categoryLabel.get(item.category) ?? item.category.replaceAll("_", " ").replaceAll(".", " · "), value: item.spentCents }));
  const investmentView = investments.views[0]!;
  const investmentTrend = investmentView.performance["3M"].points.map((point) => ({
    date: new Date(point.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    portfolio: point.portfolioChangeRate,
    benchmark: point.benchmarkChangeRate,
  }));
  const portfolioTone = investmentView.performance["3M"].changeRate >= 0 ? "#0b8f69" : "#ff4d6d";

  return <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    <ChartPanel title="Net Worth Trend" detail="Recorded balance snapshots over time.">
      {netWorthTrend.length > 1 ? <div className="h-64 min-w-0" role="img" aria-label="Net worth over time">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={netWorthTrend} margin={{ top: 10, right: 12, bottom: 0, left: 2 }}>
          <CartesianGrid stroke="#edf0f7" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: "#edf0f7" }} tick={{ fill: "#8d94a8", fontSize: 11 }} />
          <YAxis tickFormatter={(value) => compactCurrency(Number(value))} tickLine={false} axisLine={false} width={58} tick={{ fill: "#8d94a8", fontSize: 10 }} />
          <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} formatter={(value) => typeof value === "number" ? currency(value) : "-"} contentStyle={chartTooltipStyle} />
          <ReferenceLine y={0} stroke="#b8bfce" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="value" name="Net Worth" stroke="#544af7" strokeWidth={3} dot={{ r: 3, fill: "#544af7", stroke: "white", strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart></ResponsiveContainer>
      </div> : <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9ddec] px-5 text-center">
        <p className="text-sm font-semibold text-[#16192c]">Net worth history is starting</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-[#8d94a8]">Your current net worth is {currency(netWorth.netWorthCents)}. More balance snapshots will build this chart over time.</p>
      </div>}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#edf0f7] pt-3 text-xs text-[#626981]">
        <span>Assets <strong className="ml-1 tabular-nums text-[#16192c]">{currency(netWorth.assetsCents)}</strong></span>
        <span>Liabilities <strong className="ml-1 tabular-nums text-[#16192c]">{currency(netWorth.liabilitiesCents)}</strong></span>
        <span>Net Worth <strong className="ml-1 tabular-nums text-[#16192c]">{currency(netWorth.netWorthCents)}</strong></span>
      </div>
    </ChartPanel>

    <ChartPanel title="Spending by Category" detail={`${spending.month} · Top categories this month`}>
      {spendingCategories.length ? <div className="h-64 min-w-0" role="img" aria-label="Spending totals by category this month">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={spendingCategories} layout="vertical" margin={{ top: 2, right: 64, bottom: 2, left: 4 }}>
          <CartesianGrid stroke="#edf0f7" strokeDasharray="3 5" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={112} tickLine={false} axisLine={false} tick={{ fill: "#626981", fontSize: 11 }} />
          <Tooltip formatter={(value) => typeof value === "number" ? currency(value) : "-"} cursor={{ fill: "#f8f9fe" }} contentStyle={chartTooltipStyle} />
          <Bar dataKey="value" name="Spent" fill="#544af7" radius={[0, 6, 6, 0]} maxBarSize={22}>
            <LabelList dataKey="value" position="right" formatter={(value) => typeof value === "number" ? compactCurrency(value) : ""} style={{ fill: "#626981", fontSize: 10, fontWeight: 600 }} />
          </Bar>
        </BarChart></ResponsiveContainer>
      </div> : <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[#d9ddec] px-5 text-center text-sm text-[#8d94a8]">No categorized spending recorded this month.</div>}
    </ChartPanel>

    <ChartPanel title="Investment Performance" detail={`Sample portfolio vs. S&P 500 · ${investments.pricesAsOf}`} className="xl:col-span-2">
      <div className="mb-3 flex items-center justify-between gap-3"><div className="flex flex-wrap gap-4 text-xs text-[#626981]"><span><i className="mr-2 inline-block h-0.5 w-4 align-middle" style={{ background: portfolioTone }} />Portfolio <strong className="ml-1 tabular-nums text-[#16192c]">{(investmentView.performance["3M"].changeRate * 100).toFixed(1)}%</strong></span><span><i className="mr-2 inline-block h-0.5 w-4 align-middle border-t border-dashed border-[#8d94a8]" />S&amp;P 500 <strong className="ml-1 tabular-nums text-[#16192c]">{(investmentView.performance["3M"].benchmarkChangeRate * 100).toFixed(1)}%</strong></span></div><MockedBadge /></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
        <div className="h-64 min-w-0" role="img" aria-label="Three-month investment return and benchmark comparison">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={investmentTrend} margin={{ top: 8, right: 12, bottom: 0, left: 2 }}>
            <CartesianGrid stroke="#edf0f7" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#edf0f7" }} tick={{ fill: "#8d94a8", fontSize: 10 }} />
            <YAxis tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} tickLine={false} axisLine={false} width={38} tick={{ fill: "#8d94a8", fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#b8bfce" strokeDasharray="4 4" />
            <Tooltip formatter={(value) => typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "-"} contentStyle={chartTooltipStyle} />
            <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke={portfolioTone} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="benchmark" name="S&P 500" stroke="#8d94a8" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
          </LineChart></ResponsiveContainer>
        </div>
        <div className="grid grid-cols-[minmax(112px,160px)_1fr] items-center gap-3 border-t border-[#edf0f7] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="relative h-40 w-full" role="img" aria-label="Investment allocation by asset class">
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={investmentView.allocation} dataKey="valueCents" nameKey="assetClass" innerRadius={44} outerRadius={68} paddingAngle={2}>
              {investmentView.allocation.map((slice, index) => <Cell key={slice.assetClass} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie><Tooltip formatter={(value) => typeof value === "number" ? currency(value) : "-"} contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[9px] text-[#8d94a8]">Portfolio</span><strong className="text-xs tabular-nums text-[#16192c]">{compactCurrency(investmentView.totalValueCents)}</strong></div>
          </div>
          <ul className="space-y-2">
            {investmentView.allocation.map((slice, index) => <li key={slice.assetClass} className="flex items-center justify-between gap-2 text-[11px]"><span className="flex min-w-0 items-center gap-1.5 text-[#626981]"><i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} /><span className="truncate">{ASSET_CLASS_LABEL[slice.assetClass]}</span></span><span className="shrink-0 font-semibold tabular-nums text-[#16192c]">{(slice.weight * 100).toFixed(0)}%</span></li>)}
          </ul>
        </div>
      </div>
    </ChartPanel>
  </div>;
}
