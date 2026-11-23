import { formatUsd, type SpendingPace } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { compactUsd, shortDate, monthYear } from "@/lib/format";

const W = 560;
const H = 220;
const PAD = { left: 44, right: 12, top: 12, bottom: 24 };

/** One sentence that says where this month stands against last month's pace. */
function paceSentence(pace: SpendingPace): string {
  const day = pace.thisMonthCents.length;
  const gap = Math.abs(pace.aheadByCents);
  if (gap === 0) return `Day ${day}: level with last month's pace.`;
  return `Day ${day}: ${formatUsd(gap)} ${pace.aheadByCents < 0 ? "under" : "over"} last month's pace.`;
}

/** Spending added up day by day: this month solid, last month dashed, the budget total as a flat line. */
export function PaceChart({ pace }: { pace: SpendingPace }) {
  const days = Math.max(pace.thisMonthCents.length, pace.lastMonthCents.length, 2);
  const top = Math.max(1, ...pace.thisMonthCents, ...pace.lastMonthCents, pace.budgetCents ?? 0);
  const x = (i: number) => PAD.left + (i / (days - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  const line = (values: readonly number[]) => values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const ticks = [0, 0.5, 1].map((t) => Math.round(top * t));
  const lastIndex = pace.thisMonthCents.length - 1;

  return (
    <Card title="Spending Pace" subtitle={`${monthYear(pace.month)} · money out, added up day by day`}>
      <p className="mb-2 text-sm font-medium text-ink">{paceSentence(pace)}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${paceSentence(pace)} At this pace the month ends near ${formatUsd(pace.projectedCents)}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">{compactUsd(t)}</text>
          </g>
        ))}
        {pace.budgetCents !== null && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(pace.budgetCents)} y2={y(pace.budgetCents)} stroke="var(--flow-out)" strokeWidth={1.5} />
        )}
        <polyline points={line(pace.lastMonthCents)} fill="none" stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        <polyline points={line(pace.thisMonthCents)} fill="none" stroke="var(--series-1)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {lastIndex >= 0 && <circle cx={x(lastIndex)} cy={y(pace.thisMonthCents[lastIndex]!)} r={3.5} fill="var(--series-1)" />}
        <text x={PAD.left} y={H - 6} fontSize={12} fill="var(--ink-muted)">Day 1</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={12} fill="var(--ink-muted)">Day {days}</text>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-0.5 w-5" style={{ background: "var(--series-1)" }} />This month</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: "var(--ink-muted)" }} />Last month</li>
        {pace.budgetCents !== null && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-0.5 w-5" style={{ background: "var(--flow-out)" }} />Budgets total {formatUsd(pace.budgetCents)}</li>}
      </ul>
      <p className="mt-2 text-xs text-muted">At this pace the month ends near {formatUsd(pace.projectedCents)}. That is a projection, not a promise.</p>
      <table className="sr-only">
        <caption>Cumulative spending through {shortDate(pace.through)}</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">This month</th><th scope="col">Last month</th></tr></thead>
        <tbody>
          {pace.thisMonthCents.map((v, i) => (
            <tr key={i}><th scope="row">{i + 1}</th><td>{formatUsd(v)}</td><td>{pace.lastMonthCents[i] !== undefined ? formatUsd(pace.lastMonthCents[i]!) : "No data"}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
