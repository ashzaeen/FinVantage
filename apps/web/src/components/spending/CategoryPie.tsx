"use client";

import { useMemo, useState } from "react";
import { formatPercent, formatUsd, parentCategoryId, type SpendingBreakdownRow, type SpendingCategory } from "@finvantage/contracts";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { Card } from "@/components/ui/Card";

/** The dataviz skill's validated categorical order. Slots are assigned by rank, biggest first. */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const MAX_SLICES = SERIES.length;
const OTHER = "__other";
const REST = "__rest";

const SIZE = 220;
const CENTER = SIZE / 2;
const OUTER = 90;
const INNER = 58;
const LIFT = 6;

interface Slice {
  /** A category id, or OTHER or REST for the two made-up slices. */
  id: string;
  label: string;
  cents: number;
  /** Whether anything sits under it to drill into. */
  hasChildren: boolean;
}

const point = (radius: number, angle: number) => [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)] as const;

/** A donut slice from `start` to `end`, in radians clockwise from the top. */
function arcPath(start: number, end: number): string {
  // A single slice is a full ring, which one arc cannot draw: use two halves.
  if (end - start > Math.PI * 2 - 0.0001) {
    const [ox, oy] = point(OUTER, 0), [ox2, oy2] = point(OUTER, Math.PI), [ix, iy] = point(INNER, 0), [ix2, iy2] = point(INNER, Math.PI);
    return `M${ox} ${oy}A${OUTER} ${OUTER} 0 1 1 ${ox2} ${oy2}A${OUTER} ${OUTER} 0 1 1 ${ox} ${oy}M${ix} ${iy}A${INNER} ${INNER} 0 1 0 ${ix2} ${iy2}A${INNER} ${INNER} 0 1 0 ${ix} ${iy}Z`;
  }
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = point(OUTER, start), [x2, y2] = point(OUTER, end), [x3, y3] = point(INNER, end), [x4, y4] = point(INNER, start);
  return `M${x1} ${y1}A${OUTER} ${OUTER} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${INNER} ${INNER} 0 ${large} 0 ${x4} ${y4}Z`;
}

/**
 * A donut of money by category. Hover lifts a slice, a click drills into its subcategories, and
 * another click goes one level further, down to the user's own third-level categories.
 * Rows are the most specific category each amount carries; `rootId` starts the chart at that
 * category's children (income starts under "income").
 */
export function CategoryPie({
  title,
  period,
  totalNote,
  rootId = null,
  rootLabel = "All Categories",
  centerLabel,
  emptyText,
  categories,
  breakdown,
}: {
  title: string;
  /** Shown before the total: a month, or "Last Six Months". */
  period: string;
  /** Shown after the total at the top level: "so far", or "received". */
  totalNote: string;
  rootId?: string | null;
  rootLabel?: string;
  centerLabel: string;
  emptyText: string;
  categories: SpendingCategory[];
  breakdown: SpendingBreakdownRow[];
}) {
  const [path, setPath] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const labelOf = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);

  /** Spending in a category and everything under it. */
  const totalUnder = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of breakdown) {
      for (let id: string | null = row.categoryId; id; id = parentCategoryId(id)) {
        totals.set(id, (totals.get(id) ?? 0) + row.spentCents);
      }
    }
    return totals;
  }, [breakdown]);

  const current = path[path.length - 1] ?? rootId;
  const total = current ? (totalUnder.get(current) ?? 0) : breakdown.reduce((sum, r) => sum + r.spentCents, 0);

  const slices: Slice[] = useMemo(() => {
    const kids = new Map<string | null, Slice[]>();
    for (const [id, cents] of totalUnder) {
      const parent = parentCategoryId(id);
      const list = kids.get(parent) ?? [];
      list.push({ id, label: labelOf.get(id) ?? id, cents, hasChildren: false });
      kids.set(parent, list);
    }
    const level = (kids.get(current) ?? []).map((s) => ({ ...s, hasChildren: (kids.get(s.id)?.length ?? 0) > 0 }));
    // Spending booked straight to this category, with no subcategory.
    const direct = current ? (breakdown.find((r) => r.categoryId === current)?.spentCents ?? 0) : 0;
    if (direct > 0) level.push({ id: REST, label: `${labelOf.get(current!) ?? current} (General)`, cents: direct, hasChildren: false });
    level.sort((a, b) => b.cents - a.cents);
    if (level.length <= MAX_SLICES) return level;
    const rest = level.slice(MAX_SLICES - 1);
    return [...level.slice(0, MAX_SLICES - 1), { id: OTHER, label: "Other", cents: rest.reduce((n, s) => n + s.cents, 0), hasChildren: false }];
  }, [totalUnder, breakdown, current, labelOf]);

  const drill = (slice: Slice) => {
    if (!slice.hasChildren) return;
    setPath((p) => [...p, slice.id]);
    setHovered(null);
  };

  let angle = 0;
  const arcs = slices.map((slice, i) => {
    const sweep = total > 0 ? (slice.cents / total) * Math.PI * 2 : 0;
    const arc = { slice, color: SERIES[i]!, start: angle, end: angle + sweep, mid: angle + sweep / 2 };
    angle += sweep;
    return arc;
  });
  const active = arcs.find((a) => a.slice.id === hovered)?.slice ?? null;

  return (
    <Card title={title} subtitle={`${period} · ${formatUsd(total)} ${path.length ? `in ${labelOf.get(current!) ?? current}` : totalNote}`}>
      <nav aria-label="Category level" className="mb-3 flex min-h-7 flex-wrap items-center gap-1 text-xs" style={{ color: "var(--ink-muted)" }}>
        <button type="button" onClick={() => setPath([])} disabled={path.length === 0} className="rounded-md px-1.5 py-1 font-medium disabled:cursor-default" style={{ color: path.length ? "var(--accent)" : "var(--ink)" }}>
          {rootLabel}
        </button>
        {path.map((id, i) => (
          <span key={id} className="flex items-center gap-1">
            <span aria-hidden="true">›</span>
            <button type="button" onClick={() => setPath(path.slice(0, i + 1))} disabled={i === path.length - 1} className="rounded-md px-1.5 py-1 font-medium disabled:cursor-default" style={{ color: i === path.length - 1 ? "var(--ink)" : "var(--accent)" }}>
              {labelOf.get(id) ?? id}
            </button>
          </span>
        ))}
        {path.length > 0 && (
          <button type="button" onClick={() => setPath(path.slice(0, -1))} className="ml-auto rounded-lg border px-2 py-1 font-medium" style={{ borderColor: "var(--border)", color: "var(--ink)" }}>
            Back
          </button>
        )}
      </nav>

      {arcs.length === 0 ? (
        <p className="py-12 text-center text-sm" style={{ color: "var(--ink-muted)" }}>{emptyText}</p>
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(170px,0.9fr)_1.1fr]">
          <div className="relative mx-auto aspect-square w-full max-w-[230px]">
            {/* `key` restarts the entrance each time the level changes. */}
            <svg key={path.join("/")} viewBox={`0 0 ${SIZE} ${SIZE}`} className="category-pie h-full w-full overflow-visible" role="img" aria-label={title}>
              {/* The coloured slices lift on hover but ignore the mouse. */}
              {arcs.map(({ slice, color, start, end, mid }) => {
                const lifted = hovered === slice.id;
                return (
                  <g
                    key={slice.id}
                    pointerEvents="none"
                    style={{
                      transform: lifted ? `translate(${Math.sin(mid) * LIFT}px, ${-Math.cos(mid) * LIFT}px)` : "translate(0, 0)",
                      transition: "transform 160ms ease-out, filter 160ms ease-out, opacity 160ms ease-out",
                      filter: lifted ? "drop-shadow(0 4px 6px rgba(22, 25, 44, 0.25))" : "none",
                      opacity: hovered && !lifted ? 0.55 : 1,
                    }}
                  >
                    <path d={arcPath(start, end)} fill={color} fillRule="evenodd" stroke="#ffffff" strokeWidth={2} />
                  </g>
                );
              })}
              {/* Fixed hit areas, so a slice moving out from under the cursor cannot flicker. */}
              {arcs.map(({ slice, start, end }) => (
                <path
                  key={`hit-${slice.id}`}
                  data-hit={slice.id}
                  d={arcPath(start, end)}
                  fill="transparent"
                  fillRule="evenodd"
                  onMouseEnter={() => setHovered(slice.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => drill(slice)}
                  style={{ cursor: slice.hasChildren ? "pointer" : "default" }}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <span className="max-w-full truncate text-xs" style={{ color: "var(--ink-muted)" }}>{active ? active.label : path.length ? (labelOf.get(current!) ?? current) : centerLabel}</span>
              <strong className="mt-0.5 font-poppins text-lg tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(active ? active.cents : total)}</strong>
              {active && total > 0 && <span className="text-xs tabular-nums" style={{ color: "var(--ink-muted)" }}>{formatPercent(active.cents / total)}</span>}
            </div>
          </div>

          <ul className="space-y-1">
            {arcs.map(({ slice, color }) => (
              <li key={slice.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(slice.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(slice.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => drill(slice)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                  style={{ background: hovered === slice.id ? "var(--surface-inset)" : "transparent", cursor: slice.hasChildren ? "pointer" : "default" }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                    {slice.id !== OTHER && slice.id !== REST && <CategoryIcon id={slice.id} size={14} bare />}
                    <span className="truncate" style={{ color: "var(--ink-secondary)" }}>{slice.label}</span>
                    {slice.hasChildren && <span aria-hidden="true" className="text-xs" style={{ color: "var(--ink-muted)" }}>›</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(slice.cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <style>{`
        @keyframes category-pie-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
        .category-pie { animation: category-pie-in 220ms ease-out; transform-origin: 50% 50%; }
        @media (prefers-reduced-motion: reduce) { .category-pie { animation: none; } }
      `}</style>
    </Card>
  );
}
