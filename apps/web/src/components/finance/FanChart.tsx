"use client";

import { useState, type MouseEvent } from "react";
import { formatUsd, type FanPoint } from "@finvantage/contracts";

const WIDTH = 640;
const PAD = { top: 8, right: 8, bottom: 22, left: 8 };

/**
 * Placeholder fan chart: one hue, darker toward the median, with a hover readout.
 * The design-track version replaces this file. Keep the props. `height` is in chart units at a
 * 640-unit width; lower it for a shorter chart without distorting the labels.
 */
export function FanChart({
  points,
  className = "",
  height: HEIGHT = 220,
}: {
  points: FanPoint[];
  className?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.p90Cents), 1);
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (cents: number) => HEIGHT - PAD.bottom - (cents / max) * (HEIGHT - PAD.top - PAD.bottom);

  const band = (lower: keyof FanPoint, upper: keyof FanPoint) => {
    const top = points.map((p, i) => `${x(i)},${y(p[upper] as number)}`);
    const bottom = points.map((p, i) => `${x(i)},${y(p[lower] as number)}`).reverse();
    return [...top, ...bottom].join(" ");
  };
  const median = points.map((p, i) => `${x(i)},${y(p.p50Cents)}`).join(" ");

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.round(Math.min(1, Math.max(0, ratio)) * (points.length - 1)));
  }

  const active = hover === null ? null : points[hover];
  const first = points[0]!;
  const last = points[points.length - 1]!;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Projected balance from ${first.date} to ${last.date}. Median ends at ${formatUsd(last.p50Cents)}.`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <polygon points={band("p10Cents", "p90Cents")} fill="var(--fan-outer)" />
        <polygon points={band("p25Cents", "p75Cents")} fill="var(--fan-inner)" />
        <polyline points={median} fill="none" stroke="var(--fan-line)" strokeWidth={2} />
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            stroke="var(--ink-muted)"
          />
        )}
        <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill="var(--ink-muted)">
          {first.date}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} fontSize={11} fill="var(--ink-muted)" textAnchor="end">
          {last.date}
        </text>
      </svg>
      <figcaption className="mt-1 h-4 text-xs text-muted tabular-nums">
        {active
          ? `${active.date}: median ${formatUsd(active.p50Cents)}, range ${formatUsd(active.p10Cents)} to ${formatUsd(active.p90Cents)}`
          : "Median with 25-75 and 10-90 percentile bands"}
      </figcaption>
    </figure>
  );
}
