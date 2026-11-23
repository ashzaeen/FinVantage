"use client";

import { useEffect, useState } from "react";
import { formatUsd, LIFE_EVENT_LABEL, type LifeEvent, type LifeEventType } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { seriesColor } from "@/lib/chartColors";
import { monthYear } from "@/lib/format";

const YEARS = 5;
const W = 560;
const LANE = 30;
const PAD = { left: 118, right: 12, top: 8, bottom: 22 };

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/** Saved life events as lanes across the next five years: a dot for a one-time cost, a bar for a monthly one. */
export function EventsTimeline({ asOf }: { asOf: string }) {
  const [events, setEvents] = useState<LifeEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    api.listLifeEvents().then((e) => { if (live) setEvents(e); }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, []);

  if (events === null) return null;
  const end = addMonths(asOf, YEARS * 12);
  const span = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`);
  const x = (iso: string) => {
    const t = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / span;
    return PAD.left + Math.min(1, Math.max(0, t)) * (W - PAD.left - PAD.right);
  };
  const upcoming = events.filter((e) => e.date <= end && (e.recurrence === "one_time" ? e.date >= asOf : true));
  const types = [...new Set(upcoming.map((e) => e.type))] as LifeEventType[];
  const height = PAD.top + Math.max(1, types.length) * LANE + PAD.bottom;

  return (
    <Card title="Events Timeline" subtitle="Your saved life events over the next five years" lift={false}>
      {types.length === 0 ? (
        <p className="text-sm text-muted">No saved events in the next five years. Model one above and choose Save Changes to see it here.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={`${upcoming.length} saved life events over the next five years, in ${types.length} lanes.`}>
            {Array.from({ length: YEARS + 1 }, (_, i) => addMonths(asOf, i * 12)).map((d) => (
              <g key={d}>
                <line x1={x(d)} x2={x(d)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--border)" />
                <text x={x(d)} y={height - 6} textAnchor="middle" fontSize={12} fill="var(--ink-muted)">{d.slice(0, 4)}</text>
              </g>
            ))}
            {types.map((type, lane) => {
              const cy = PAD.top + lane * LANE + LANE / 2;
              const color = seriesColor(lane);
              return (
                <g key={type}>
                  <text x={PAD.left - 8} y={cy + 4} textAnchor="end" fontSize={12} fill="var(--ink-secondary)">{LIFE_EVENT_LABEL[type]}</text>
                  {upcoming.filter((e) => e.type === type).map((e) =>
                    e.recurrence === "recurring" ? (
                      <rect key={e.id} x={x(e.date)} y={cy - 5} height={10} rx={5} fill={color} width={Math.max(8, (e.durationMonths ? x(addMonths(e.date, e.durationMonths)) : W - PAD.right) - x(e.date))} />
                    ) : (
                      <circle key={e.id} cx={x(e.date)} cy={cy} r={6} fill={color} />
                    ),
                  )}
                </g>
              );
            })}
          </svg>
          <ul className="sr-only">
            {upcoming.map((e) => (
              <li key={e.id}>{LIFE_EVENT_LABEL[e.type]}, {monthYear(e.date)}, {e.recurrence === "recurring" ? `${formatUsd(Math.abs(e.dollarImpactCents))} a month${e.durationMonths ? ` for ${e.durationMonths} months` : ""}` : formatUsd(Math.abs(e.dollarImpactCents))}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">A dot is a one-time event. A bar is a cost or change that repeats every month.</p>
        </>
      )}
    </Card>
  );
}
