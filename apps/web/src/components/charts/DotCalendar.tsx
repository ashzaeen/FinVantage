"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { formatUsd } from "@finvantage/contracts";
import { longDate, shortDate } from "@/lib/format";

export type CalendarTone = "out" | "in" | "warn" | "info";

export interface CalendarEvent {
  date: string;
  tone: CalendarTone;
  label: string;
  amountCents?: number;
}

const TONE: Record<CalendarTone, string> = {
  out: "var(--flow-out)",
  in: "var(--flow-in)",
  warn: "var(--warning)",
  info: "var(--series-5)",
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const money = (e: CalendarEvent) => (e.amountCents !== undefined ? ` ${formatUsd(Math.abs(e.amountCents))}` : "");

/**
 * Days as a grid of weeks, with a dot for each thing that happens on one. From 640px each day is a
 * button: tap or press Enter to read that day's list below, and the arrow keys move between days
 * (left and right by a day, up and down by a week). Below 640px the grid gives way to a plain list
 * by date, which is easier to read on a phone. Starts on the Sunday of the week holding `from`.
 * Colour is a hint, never the only signal: every day's list says what each dot is.
 */
export function DotCalendar({ from, days, events, label }: { from: string; days: number; events: readonly CalendarEvent[]; label: string }) {
  const startDow = new Date(`${from}T00:00:00Z`).getUTCDay();
  const gridStart = addDays(from, -startDow);
  const total = Math.ceil((days + startDow) / 7) * 7;
  const end = addDays(from, days - 1);
  const inWindow = events.filter((e) => e.date >= from && e.date <= end);
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of inWindow) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
  const cells = Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  const withEvents = [...byDate.keys()].sort();

  const [selected, setSelected] = useState(from);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = addDays(date, step);
    if (next < from || next > end) return;
    setSelected(next);
    refs.current[next]?.focus();
  }

  const chosen = byDate.get(selected) ?? [];

  return (
    <div>
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden="true">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label={label}>
          {cells.map((date) => {
            const inRange = date >= from && date <= end;
            const here = byDate.get(date) ?? [];
            const dots = (
              <>
                {Number(date.slice(8))}
                <span className="flex h-1.5 gap-0.5">
                  {here.slice(0, 3).map((e, i) => <i key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[e.tone] }} />)}
                </span>
              </>
            );
            if (!inRange) return <span key={date} className="flex min-h-9 flex-col items-center justify-center gap-0.5 rounded-md text-xs tabular-nums text-muted">{dots}</span>;
            return (
              <button
                key={date}
                ref={(el) => { refs.current[date] = el; }}
                type="button"
                tabIndex={date === selected ? 0 : -1}
                aria-pressed={date === selected}
                aria-label={`${longDate(date)}: ${here.length === 0 ? "nothing scheduled" : here.map((e) => `${e.label}${money(e)}`).join(", ")}`}
                onClick={() => setSelected(date)}
                onKeyDown={(e) => onKey(e, date)}
                className={`tap-auto flex min-h-9 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md text-xs tabular-nums text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink ${date === selected ? "bg-accent-soft ring-1 ring-accent-ink" : "bg-inset hover:bg-accent-soft"}`}
              >
                {dots}
              </button>
            );
          })}
        </div>
        <div aria-live="polite" className="mt-3 rounded-xl bg-inset p-3 text-sm">
          <p className="text-xs font-semibold text-muted">{longDate(selected)}</p>
          {chosen.length === 0 ? (
            <p className="mt-1 text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {chosen.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-ink"><i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[e.tone] }} /><span className="truncate">{e.label}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{e.amountCents !== undefined ? formatUsd(Math.abs(e.amountCents)) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ul className="space-y-1.5 sm:hidden" aria-label={label}>
        {withEvents.length === 0 && <li className="text-sm text-muted">Nothing scheduled.</li>}
        {withEvents.flatMap((date) => (byDate.get(date) ?? []).map((e, i) => (
          <li key={`${date}-${i}`} className="flex items-center justify-between gap-3 rounded-xl bg-inset px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <i aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[e.tone] }} />
              <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-accent-ink">{shortDate(date)}</span>
              <span className="truncate text-ink">{e.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{e.amountCents !== undefined ? formatUsd(Math.abs(e.amountCents)) : ""}</span>
          </li>
        )))}
      </ul>
    </div>
  );
}
