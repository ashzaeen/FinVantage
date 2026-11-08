"use client";

import { useState, type MouseEvent } from "react";
import { formatUsd, type LifeScenarioAnalysis, type LifeSimulatorContext } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import {
  formatDate,
  SERIES,
  type ScenarioForm,
} from "./lifeSimulatorShared";

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 12, right: 10, bottom: 22, left: 10 };

/** Trims the trailing flat stretch once both lines have leveled off, so a goal that funds early
 * doesn't stretch the chart out to the full 15-year series cap for no visual reason. */
function trimToRelevantWindow(series: Array<{ month: string; beforeCents: number; afterCents: number }>) {
  const MIN_POINTS = 18;
  const PADDING = 6;
  let lastChange = series.length - 1;
  for (let i = series.length - 1; i > 0; i -= 1) {
    if (series[i]!.beforeCents !== series[i - 1]!.beforeCents || series[i]!.afterCents !== series[i - 1]!.afterCents) {
      lastChange = i;
      break;
    }
  }
  const end = Math.max(Math.min(series.length, lastChange + PADDING), Math.min(series.length, MIN_POINTS));
  return series.slice(0, end);
}

function LineChart({
  series: fullSeries, eventMonth, dropMonth,
}: {
  series: Array<{ month: string; beforeCents: number; afterCents: number }>;
  eventMonth: string;
  dropMonth: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const series = trimToRelevantWindow(fullSeries);
  if (series.length < 2) return <p className="py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>Not enough data to chart.</p>;

  const max = Math.max(...series.map((p) => Math.max(p.beforeCents, p.afterCents)), 1);
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (cents: number) => HEIGHT - PAD.bottom - (Math.max(0, cents) / max) * (HEIGHT - PAD.top - PAD.bottom);
  const line = (key: "beforeCents" | "afterCents") => series.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const eventIndex = series.findIndex((p) => p.month >= eventMonth);
  const dropIndex = dropMonth ? series.findIndex((p) => p.month === dropMonth) : -1;
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const active = hover === null ? null : series[hover];

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.round(Math.min(1, Math.max(0, ratio)) * (series.length - 1)));
  }

  return <figure>
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Projected balance from ${first.month} to ${last.month}: ${formatUsd(first.afterCents)} to ${formatUsd(last.afterCents)} with the plan, versus ${formatUsd(last.beforeCents)} on the current plan.`}
      className="w-full"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <polyline points={line("beforeCents")} fill="none" stroke="var(--ink-light, #b3b9cb)" strokeWidth={2} strokeDasharray="6 5" />
      <polyline points={line("afterCents")} fill="none" stroke="#544af7" strokeWidth={2.5} />
      {eventIndex >= 0 && <line x1={x(eventIndex)} x2={x(eventIndex)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--warning)" strokeWidth={1} strokeDasharray="3 3" />}
      {eventIndex >= 0 && <text x={x(eventIndex)} y={PAD.top + 10} fontSize={10} fill="var(--warning)" textAnchor="middle">Event</text>}
      {dropIndex >= 0 && <circle cx={x(dropIndex)} cy={y(series[dropIndex]!.afterCents)} r={4} fill="var(--warning)" stroke="white" strokeWidth={1.5} />}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--ink-muted)" strokeWidth={1} />}
      {hover !== null && <circle cx={x(hover)} cy={y(series[hover]!.afterCents)} r={3.5} fill="#544af7" />}
      <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill="var(--ink-muted)">{formatDate(first.month)}</text>
      <text x={WIDTH - PAD.right} y={HEIGHT - 6} fontSize={11} fill="var(--ink-muted)" textAnchor="end">{formatDate(last.month)}</text>
    </svg>
    <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
      <span>{active ? `${formatDate(active.month)}: ${formatUsd(active.afterCents)} with this plan, ${formatUsd(active.beforeCents)} on the current plan.` : "Hover the chart to read a month's balance."}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-0.5 w-4" style={{ background: "var(--ink-light, #b3b9cb)" }} />Current plan</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-0.5 w-4" style={{ background: "#544af7" }} />With this plan</span>
        {dropIndex >= 0 && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} />One-time cost</span>}
      </span>
    </figcaption>
  </figure>;
}

function MoneyFlowChart({ analysis, context }: { analysis: LifeScenarioAnalysis; context: LifeSimulatorContext }) {
  const included = analysis.goals.filter((goal) => goal.included);
  const beforeTotal = Math.max(1, context.freeCashCents);
  const afterTotal = Math.max(1, analysis.analysis.freeCashAfterCents);
  const rawBars = [
    { label: "Today", total: beforeTotal, segments: context.goals.filter((g) => analysis.goals.some((r) => r.goalId === g.id && r.included)).map((g) => ({ name: g.name, cents: g.monthlyContributionCents })) },
    { label: "After Event", total: afterTotal, segments: included.map((goal) => ({ name: goal.name, cents: goal.postEventContributionCents })) },
  ];
  // The committed split can exceed free cash when the user allows going over budget, so scale
  // each bar's height against whichever is larger: its free-cash total or what's actually
  // committed. That way segments always fill their own bar exactly, and an over-committed bar
  // visibly grows taller than its label, instead of overflowing its container.
  const bars = rawBars.map((bar) => ({ ...bar, segmentSum: Math.max(1, bar.segments.reduce((sum, s) => sum + s.cents, 0)) }));
  const maxScale = Math.max(...bars.map((bar) => Math.max(bar.total, bar.segmentSum)));

  return <div>
    <div className="flex items-end justify-center gap-12 py-4 sm:gap-16">{bars.map((bar) => {
      const barHeight = Math.round((Math.max(bar.total, bar.segmentSum) / maxScale) * 170);
      const overBudget = bar.segmentSum > bar.total;
      return <div key={bar.label} className="flex flex-col items-center gap-2">
        <div className="flex h-[170px] w-20 items-end" aria-hidden="true">
          <div className="life-sim-bar flex w-full flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: `${barHeight}px` }}>
            {bar.segments.map((segment, index) => {
              const height = Math.round((segment.cents / bar.segmentSum) * barHeight);
              return <div key={segment.name} title={`${segment.name}: ${formatUsd(segment.cents)}`} style={{ height: `${height}px`, background: SERIES[index % SERIES.length] }} />;
            })}
          </div>
        </div>
        <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{bar.label}</p>
        <p className="text-xs tabular-nums" style={{ color: overBudget ? "var(--critical)" : "var(--ink-muted)" }}>{formatUsd(bar.segmentSum)}{overBudget && ` of ${formatUsd(bar.total)}`}</p>
      </div>;
    })}</div>
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--ink-secondary)" }}>
      {bars[1]!.segments.map((segment, index) => <li key={segment.name} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[index % SERIES.length] }} />{segment.name}: <span className="tabular-nums">{formatUsd(segment.cents)}</span></li>)}
    </ul>
    <style>{`
      @keyframes life-sim-bar-in { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      .life-sim-bar { animation: life-sim-bar-in 320ms ease-out; transform-origin: bottom; }
      @media (prefers-reduced-motion: reduce) { .life-sim-bar { animation: none; } }
    `}</style>
  </div>;
}

export function LifeSimulatorCharts({
  context, form, analysis,
}: {
  context: LifeSimulatorContext;
  form: ScenarioForm;
  analysis: LifeScenarioAnalysis;
}) {
  const goals = analysis.goals.filter((goal) => goal.included);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const activeGoal = goals.find((goal) => goal.goalId === activeGoalId) ?? goals[0] ?? null;

  return <section aria-labelledby="scenario-charts-heading" className="space-y-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
    <div><h2 id="scenario-charts-heading" className="font-poppins text-lg font-bold" style={{ color: "var(--ink)" }}>Charts</h2><p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>See how the event changes each goal’s projected balance and monthly contribution.</p></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Goal Balance Over Time">
        {goals.length ? <>
          <div className="flex flex-wrap gap-2">{goals.map((goal) => <button key={goal.goalId} type="button" onClick={() => setActiveGoalId(goal.goalId)} aria-pressed={activeGoal?.goalId === goal.goalId} className="min-h-11 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]" style={activeGoal?.goalId === goal.goalId ? { background: "var(--accent-soft, #eceeff)", color: "var(--accent)" } : { background: "var(--surface-inset)", color: "var(--ink-muted)" }}>{goal.name}</button>)}</div>
          <div className="mt-4">{activeGoal && <LineChart series={activeGoal.series} eventMonth={form.startMonth} dropMonth={activeGoal.goalId === form.oneTimeSourceGoalId && form.oneTimeCostCents > 0 ? form.startMonth.slice(0, 7) + "-01" : null} />}</div>
        </> : <p className="py-6 text-sm" style={{ color: "var(--ink-muted)" }}>Select at least one goal before generating.</p>}
      </Card>

      <Card title="Where Each Month’s Money Goes" subtitle="Monthly contribution by goal before and after the event">
        <MoneyFlowChart analysis={analysis} context={context} />
      </Card>
    </div>
  </section>;
}
