import type { CSSProperties } from "react";

export type BulletTone = "accent" | "in" | "out" | "warn";

const TONE: Record<BulletTone, string> = {
  accent: "var(--series-1)",
  in: "var(--flow-in)",
  out: "var(--flow-out)",
  warn: "var(--warning)",
};

/**
 * One bar: a track, a fill, and optionally a target tick and a band around the target. The same
 * shape serves runway, liquidity, goal funding, allocation drift and promo countdowns.
 * `fill`, `target` and the band are shares of the track, 0 to 1. It never computes a figure: the
 * words in `valueText` and `targetText` come from the API.
 */
export function BulletBar({
  label,
  valueText,
  fill,
  target,
  targetText,
  band,
  tone = "accent",
  note,
  index = 0,
}: {
  label: string;
  valueText: string;
  fill: number;
  target?: number;
  targetText?: string;
  /** The allowed range around the target, as shares of the track. */
  band?: readonly [number, number];
  tone?: BulletTone;
  /** A line under the bar, such as "Short by $32 a month". */
  note?: string;
  /** Position in a list, for the staggered fill animation. */
  index?: number;
}) {
  const share = (n: number) => `${Math.min(100, Math.max(0, n * 100))}%`;
  const summary = `${label}: ${valueText}${targetText ? `, target ${targetText}` : ""}${note ? `. ${note}` : ""}`;
  return (
    <div className="min-w-0" role="img" aria-label={summary}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-medium text-ink-secondary">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-ink">{valueText}</span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-full bg-inset" aria-hidden="true">
        {band && <div className="absolute inset-y-0 rounded-full bg-accent-soft" style={{ left: share(band[0]), width: share(band[1] - band[0]) }} />}
        <div className="meter-fill absolute inset-y-0 left-0 rounded-full" style={{ width: share(fill), background: TONE[tone], "--i": index } as CSSProperties} />
        {target !== undefined && <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ left: `calc(${share(target)} - 1px)` }} />}
      </div>
      {note && <p className="mt-1 text-xs text-muted" aria-hidden="true">{note}</p>}
    </div>
  );
}
