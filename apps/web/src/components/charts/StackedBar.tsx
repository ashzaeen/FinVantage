import { formatUsd } from "@finvantage/contracts";

export interface StackSegment {
  label: string;
  cents: number;
  color: string;
  /** Drawn as an outline instead of a fill, for money not spoken for. */
  hollow?: boolean;
}

/**
 * One bar split into parts that add up to a whole, with a legend that names each part and its
 * amount. Parts keep their order and a gap separates them. The legend is the text version, so the
 * colors are never the only signal. It draws what it is given and computes no figure.
 */
export function StackedBar({ segments, label }: { segments: readonly StackSegment[]; label: string }) {
  const shown = segments.filter((s) => s.cents > 0);
  const total = shown.reduce((sum, s) => sum + s.cents, 0);
  return (
    <div>
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-full bg-inset" role="img" aria-label={`${label}: ${shown.map((s) => `${s.label} ${formatUsd(s.cents)}`).join(", ")}`}>
        {shown.map((s) => (
          <span
            key={s.label}
            title={`${s.label}: ${formatUsd(s.cents)}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.cents / total) * 100}%`, background: s.hollow ? "transparent" : s.color, boxShadow: s.hollow ? `inset 0 0 0 2px ${s.color}` : undefined }}
          />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {shown.map((s) => (
          <li key={s.label} className="flex min-w-0 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <i aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.hollow ? "transparent" : s.color, boxShadow: s.hollow ? `inset 0 0 0 2px ${s.color}` : undefined }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{formatUsd(s.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
