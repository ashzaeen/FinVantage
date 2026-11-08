"use client";

import { formatUsd, type LifeScenarioAnalysis, type LifeSimulatorContext } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { SERIES } from "./lifeSimulatorShared";

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
  context, analysis,
}: {
  context: LifeSimulatorContext;
  analysis: LifeScenarioAnalysis;
}) {
  return <section aria-label="Where Each Month’s Money Goes" className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
    <Card title="Where Each Month’s Money Goes" subtitle="Monthly contribution by goal before and after the event">
      <MoneyFlowChart analysis={analysis} context={context} />
    </Card>
  </section>;
}
