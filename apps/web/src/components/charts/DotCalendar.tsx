import { formatUsd } from "@finvantage/contracts";
import { shortDate } from "@/lib/format";

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

/**
 * Days as a grid of weeks, with a dot for each thing that happens on one: a renewal, a payday, a
 * card's due date. Starts on the Sunday of the week holding `from`. Every event is also in a
 * visually hidden list, so the dots are never the only way to read it. Events outside the window
 * are ignored. Colour is a hint, never the only signal: the list and each day's title say what it is.
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
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="img" aria-label={label}>
        {cells.map((date) => {
          const inRange = date >= from && date <= end;
          const here = byDate.get(date) ?? [];
          return (
            <span
              key={date}
              title={here.length ? here.map((e) => `${shortDate(date)}: ${e.label}${e.amountCents !== undefined ? ` ${formatUsd(Math.abs(e.amountCents))}` : ""}`).join("\n") : undefined}
              className={`flex min-h-9 flex-col items-center justify-center gap-0.5 rounded-md text-xs tabular-nums ${inRange ? "bg-inset text-ink" : "text-muted"}`}
            >
              {Number(date.slice(8))}
              <span className="flex h-1.5 gap-0.5">
                {here.slice(0, 3).map((e, i) => <i key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[e.tone] }} />)}
              </span>
            </span>
          );
        })}
      </div>
      <ul className="sr-only">
        {inWindow.map((e, i) => <li key={i}>{shortDate(e.date)}: {e.label}{e.amountCents !== undefined ? `, ${formatUsd(Math.abs(e.amountCents))}` : ""}</li>)}
      </ul>
    </div>
  );
}
