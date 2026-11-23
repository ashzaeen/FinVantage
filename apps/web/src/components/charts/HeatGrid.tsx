import { formatUsd } from "@finvantage/contracts";
import { longDate } from "@/lib/format";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/**
 * A month as a calendar, each day shaded by how much was spent. A day with nothing spent (on or
 * before `today`) is outlined instead of shaded, so calm days stand out. Days after `today` stay
 * blank. `cents` maps an ISO date to money out that day; the figures come from the API.
 */
export function HeatGrid({ month, cents, today, label }: { month: string; cents: Readonly<Record<string, number>>; today: string; label: string }) {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const max = Math.max(1, ...Object.values(cents));
  const cells: Array<{ day: number; date: string } | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, date: `${month}-${String(i + 1).padStart(2, "0")}` })),
  ];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden="true">
        {WEEKDAYS.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="img" aria-label={label}>
        {cells.map((cell, i) => {
          if (!cell) return <span key={`blank-${i}`} />;
          const spent = cents[cell.date] ?? 0;
          const future = cell.date > today;
          const calm = !future && spent === 0;
          const style = future
            ? undefined
            : calm
              ? { boxShadow: "inset 0 0 0 1.5px var(--series-1)" }
              : { background: `color-mix(in srgb, var(--series-1) ${Math.round(18 + (spent / max) * 42)}%, transparent)` };
          return (
            <span
              key={cell.date}
              title={future ? undefined : `${cell.date}: ${spent === 0 ? "nothing spent" : formatUsd(spent)}`}
              className={`flex aspect-square items-center justify-center rounded-md text-xs tabular-nums ${future ? "bg-inset text-muted" : "text-ink"}`}
              style={style}
            >
              {cell.day}
            </span>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead><tr><th>Date</th><th>Spent</th></tr></thead>
        <tbody>
          {cells.filter((c): c is { day: number; date: string } => !!c && c.date <= today).map((c) => (
            <tr key={c.date}><td>{longDate(c.date)}</td><td>{formatUsd(cents[c.date] ?? 0)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
