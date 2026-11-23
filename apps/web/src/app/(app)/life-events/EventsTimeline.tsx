"use client";

import { useEffect, useState } from "react";
import { formatUsd, LIFE_EVENT_LABEL, type Goal, type LifeEvent, type LifeEventType } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { seriesColor } from "@/lib/chartColors";
import { monthYear, plural } from "@/lib/format";

const YEARS = 5;
const MAX_SHIFT_MONTHS = 24;
const W = 560;
const LANE = 30;
const PAD = { left: 118, right: 12, top: 8, bottom: 22 };

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/**
 * Saved life events as lanes across five years: a dot for a one-time cost, a bar for a monthly one,
 * and your goals' target dates as diamonds on the top lane. The slider moves the window forward.
 */
export function EventsTimeline({ asOf }: { asOf: string }) {
  const [events, setEvents] = useState<LifeEvent[] | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    let live = true;
    api.listLifeEvents().then((e) => { if (live) setEvents(e); }).catch(() => { if (live) setEvents([]); });
    api.listGoals().then((g) => { if (live) setGoals(g); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  if (events === null) return null;
  const start = addMonths(asOf, shift);
  const end = addMonths(start, YEARS * 12);
  const span = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  const x = (iso: string) => {
    const t = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / span;
    return PAD.left + Math.min(1, Math.max(0, t)) * (W - PAD.left - PAD.right);
  };
  const eventEnd = (e: LifeEvent) => (e.durationMonths ? addMonths(e.date, e.durationMonths) : "9999-12-31");
  const shown = events.filter((e) => (e.recurrence === "recurring" ? e.date <= end && eventEnd(e) >= start : e.date >= start && e.date <= end));
  const goalsShown = goals.filter((g) => g.targetDate >= start && g.targetDate <= end);
  const types = [...new Set(shown.map((e) => e.type))] as LifeEventType[];
  const lanes = (goalsShown.length > 0 ? 1 : 0) + types.length;
  const height = PAD.top + Math.max(1, lanes) * LANE + PAD.bottom;
  const laneY = (i: number) => PAD.top + i * LANE + LANE / 2;
  const offset = goalsShown.length > 0 ? 1 : 0;

  return (
    <Card title="Events Timeline" subtitle="Your saved life events and goal dates over five years" lift={false}>
      <label className="mb-3 block text-sm font-medium text-ink">Starting {monthYear(start)}{shift > 0 ? ` (${plural(shift, "month")} ahead)` : ""}
        <input type="range" min={0} max={MAX_SHIFT_MONTHS} step={1} value={shift} onChange={(e) => setShift(Number(e.target.value))} className="mt-1 block h-11 w-full accent-[var(--accent)]" />
      </label>
      {lanes === 0 ? (
        <p className="text-sm text-muted">Nothing saved in this window. Model an event above and choose Save Changes to see it here.</p>
      ) : (
        <>
          <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${height}`} className="w-full min-w-[30rem] max-w-[44rem]" role="img" aria-label={`${shown.length} saved life events and ${goalsShown.length} goal dates between ${monthYear(start)} and ${monthYear(end)}.`}>
            {Array.from({ length: YEARS + 1 }, (_, i) => addMonths(start, i * 12)).map((d) => (
              <g key={d}>
                <line x1={x(d)} x2={x(d)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--border)" />
                <text x={x(d)} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--ink-muted)">{d.slice(0, 4)}</text>
              </g>
            ))}
            {goalsShown.length > 0 && (
              <g>
                <text x={PAD.left - 8} y={laneY(0) + 4} textAnchor="end" fontSize={12} fill="var(--ink-secondary)">Goal dates</text>
                {goalsShown.map((g) => <rect key={g.id} x={x(g.targetDate) - 5} y={laneY(0) - 5} width={10} height={10} transform={`rotate(45 ${x(g.targetDate)} ${laneY(0)})`} fill="var(--ink)" />)}
              </g>
            )}
            {types.map((type, lane) => {
              const cy = laneY(lane + offset);
              const color = seriesColor(lane);
              return (
                <g key={type}>
                  <text x={PAD.left - 8} y={cy + 4} textAnchor="end" fontSize={12} fill="var(--ink-secondary)">{LIFE_EVENT_LABEL[type]}</text>
                  {shown.filter((e) => e.type === type).map((e) =>
                    e.recurrence === "recurring" ? (
                      <rect key={e.id} x={x(e.date)} y={cy - 5} height={10} rx={5} fill={color} width={Math.max(8, (e.durationMonths ? x(eventEnd(e)) : W - PAD.right) - x(e.date))} />
                    ) : (
                      <circle key={e.id} cx={x(e.date)} cy={cy} r={6} fill={color} />
                    ),
                  )}
                </g>
              );
            })}
          </svg></div>
          <ul className="sr-only">
            {goalsShown.map((g) => <li key={g.id}>Goal {g.name}: {monthYear(g.targetDate)}</li>)}
            {shown.map((e) => (
              <li key={e.id}>{LIFE_EVENT_LABEL[e.type]}, {monthYear(e.date)}, {e.recurrence === "recurring" ? `${formatUsd(Math.abs(e.dollarImpactCents))} a month${e.durationMonths ? ` for ${e.durationMonths} months` : ""}` : formatUsd(Math.abs(e.dollarImpactCents))}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">A dot is a one-time event. A bar repeats every month. A diamond is a goal's target date.</p>
        </>
      )}
    </Card>
  );
}
