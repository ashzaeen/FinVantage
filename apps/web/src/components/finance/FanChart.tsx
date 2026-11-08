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
  comparisonPoints = [],
  comparisonLabel = "Current Plan",
  className = "",
  height: HEIGHT = 220,
}: {
  points: FanPoint[];
  comparisonPoints?: FanPoint[];
  comparisonLabel?: string;
  className?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.p90Cents), ...comparisonPoints.map((p) => p.p90Cents), 1);
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (cents: number) => HEIGHT - PAD.bottom - (cents / max) * (HEIGHT - PAD.top - PAD.bottom);

  const band = (lower: keyof FanPoint, upper: keyof FanPoint) => {
    const top = points.map((p, i) => `${x(i)},${y(p[upper] as number)}`);
    const bottom = points.map((p, i) => `${x(i)},${y(p[lower] as number)}`).reverse();
    return [...top, ...bottom].join(" ");
  };
  const median = points.map((p, i) => `${x(i)},${y(p.p50Cents)}`).join(" ");
  const comparisonMedian = comparisonPoints.length > 1
    ? comparisonPoints.map((point, index) => `${PAD.left + (index / (comparisonPoints.length - 1)) * (WIDTH - PAD.left - PAD.right)},${y(point.p50Cents)}`).join(" ")
    : "";

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
        aria-label={`Projected balance from ${first.date} to ${last.date}. Scenario median ends at ${formatUsd(last.p50Cents)}${comparisonPoints.length ? `, compared with ${comparisonLabel}` : ""}.`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <polygon points={band("p10Cents", "p90Cents")} fill="var(--fan-outer)" />
        <polygon points={band("p25Cents", "p75Cents")} fill="var(--fan-inner)" />
        {comparisonMedian && <polyline points={comparisonMedian} fill="none" stroke="var(--ink-muted)" strokeWidth={2} strokeDasharray="6 5" />}
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
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted tabular-nums">
        <span>{active ? `${active.date}: median ${formatUsd(active.p50Cents)}, range ${formatUsd(active.p10Cents)} to ${formatUsd(active.p90Cents)}` : "Shaded area shows the range of possible balances."}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--fan-inner)" }} />Scenario Range</span>
          <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-0.5 w-4" style={{ background: "var(--fan-line)" }} />Scenario Median</span>
          {comparisonMedian && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-0.5 w-4 border-t border-dashed" style={{ borderColor: "var(--ink-muted)" }} />{comparisonLabel}</span>}
        </span>
      </figcaption>
      <details className="mt-3 rounded-xl border border-[#edf0f7] bg-[#fafbfe] px-3 py-2 text-xs text-[#626981]">
        <summary className="cursor-pointer font-semibold text-[#4a4f68]">View Projection Data</summary>
        <div className="mt-2 max-h-52 overflow-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead><tr className="border-b border-[#e8ebf3] text-[10px] uppercase tracking-wide text-[#8d94a8]"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Low</th><th className="py-2 pr-3">Median</th><th className="py-2 pr-3">High</th>{comparisonMedian && <th className="py-2">{comparisonLabel}</th>}</tr></thead>
            <tbody>{points.map((point, index) => <tr key={point.date} className="border-b border-[#edf0f7] last:border-0"><td className="py-2 pr-3">{point.date}</td><td className="py-2 pr-3">{formatUsd(point.p10Cents)}</td><td className="py-2 pr-3 font-semibold text-[#16192c]">{formatUsd(point.p50Cents)}</td><td className="py-2 pr-3">{formatUsd(point.p90Cents)}</td>{comparisonMedian && <td className="py-2">{comparisonPoints[Math.round(index * (comparisonPoints.length - 1) / (points.length - 1))] ? formatUsd(comparisonPoints[Math.round(index * (comparisonPoints.length - 1) / (points.length - 1))]!.p50Cents) : "—"}</td>}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
