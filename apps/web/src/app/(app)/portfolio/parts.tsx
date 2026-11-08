"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatUsd } from "@finvantage/contracts";

/* ── Display formats. The figures themselves come from the API. ───────── */

export const signedUsd = (cents: number) => `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${formatUsd(Math.abs(cents))}`;

export const percent = (rate: number) => `${(Math.abs(rate) * 100).toFixed(2)}%`;

export const signedPercent = (rate: number) => `${rate > 0 ? "+" : rate < 0 ? "−" : ""}${percent(rate)}`;

export function compactUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const directionClass = (value: number) => (value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted");

/* ── Direction: an arrow and a sign, so gains never rely on color alone ── */

export function Change({ rate, className = "" }: { rate: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tabular-nums ${directionClass(rate)} ${className}`}>
      {rate !== 0 && <span aria-hidden="true" className="text-[0.7em]">{rate > 0 ? "▲" : "▼"}</span>}
      {signedPercent(rate)}
    </span>
  );
}

/* ── Sortable tables ──────────────────────────────────────────────────── */

export interface SortState<K extends string> {
  key: K;
  desc: boolean;
}

export function useSortedRows<T, K extends string>(
  rows: T[],
  accessors: Record<K, (row: T) => number | string>,
  initial: SortState<NoInfer<K>>,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => {
    const read = accessors[sort.key];
    const direction = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => {
      const [x, y] = [read(a), read(b)];
      return direction * (typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y));
    });
  }, [rows, accessors, sort]);
  // A number column starts with the largest first, and a name column starts at A.
  const toggle = (key: K) =>
    setSort((current) => (current.key === key ? { key, desc: !current.desc } : { key, desc: rows[0] ? typeof accessors[key](rows[0]) === "number" : true }));
  return { sorted, sort, toggle };
}

export function SortHeader<K extends string>({ label, column, sort, onSort, className = "" }: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  className?: string;
}) {
  const active = sort.key === column;
  return (
    <th aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"} className={`pb-2 font-medium ${className}`}>
      <button type="button" onClick={() => onSort(column)} className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${active ? "text-ink-secondary" : ""}`}>
        {label}
        <span aria-hidden="true" className={`w-2 text-[9px] ${active ? "" : "opacity-0"}`}>{sort.desc ? "▼" : "▲"}</span>
      </button>
    </th>
  );
}

/* ── Expanding rows ───────────────────────────────────────────────────── */

export function Chevron({ open }: { open: boolean }) {
  return <span aria-hidden="true" className={`inline-block text-[9px] text-muted transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""}`}>▶</span>;
}

export function ExpandPanel({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="invest-expand" data-open={open}>
      <div inert={!open}>{children}</div>
    </div>
  );
}

/* ── Month of prices: a tiny line for rows, a hoverable one for details ── */

export function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  const span = high - low || 1;
  const points = prices.map((price, i) => `${(i / (prices.length - 1)) * 64},${22 - ((price - low) / span) * 20}`).join(" ");
  return (
    <svg aria-hidden="true" viewBox="0 0 64 24" className="ml-auto h-6 w-16">
      <polyline points={points} fill="none" stroke="var(--series-1)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const MINI_WIDTH = 240;
const MINI_HEIGHT = 56;

export function MiniChart({ prices, dates, name, open }: { prices: number[]; dates: string[]; name: string; open: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  if (prices.length < 2) return null;

  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  const span = high - low || 1;
  const x = (i: number) => (i / (prices.length - 1)) * MINI_WIDTH;
  const y = (price: number) => MINI_HEIGHT - 3 - ((price - low) / span) * (MINI_HEIGHT - 6);
  const line = prices.map((price, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(price)}`).join(" ");
  const shown = hover ?? prices.length - 1;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted">{hover === null ? "Past Month" : shortDate(dates[hover] ?? "")}</span>
        <span className="font-semibold tabular-nums text-ink">{formatUsd(prices[shown]!)}</span>
      </div>
      <div className={open ? "invest-reveal" : ""}>
        <svg
          viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${name} closing prices over the past month, from ${formatUsd(prices[0]!)} to ${formatUsd(prices[prices.length - 1]!)}`}
          className="h-14 w-full cursor-crosshair touch-none"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
            setHover(Math.round(ratio * (prices.length - 1)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <path d={line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={MINI_HEIGHT} stroke="var(--ink-light)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
    </div>
  );
}

export function DetailStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{children}</p>
    </div>
  );
}

/* ── A number that eases to its new value, like the Credit tab's gauge ── */

const COUNT_DURATION_MS = 700;

export function AnimatedNumber({ value, format }: { value: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / COUNT_DURATION_MS);
      const current = origin + (value - origin) * (1 - Math.pow(1 - progress, 3));
      from.current = current;
      setShown(progress === 1 ? value : Math.round(current));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{format(shown)}</>;
}

/* ── Pills with one indicator that slides to the selected option ──────── */

export function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
  compact = false,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  compact?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const active = buttons.current.get(value);
      if (active) setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    // Also re-measures once the web fonts arrive and the labels change width.
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div
      ref={container}
      role="group"
      aria-label={label}
      className="no-scrollbar relative inline-flex max-w-full overflow-x-auto rounded-full bg-inset p-1"
    >
      {indicator && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 left-0 top-1 rounded-full bg-raised shadow-[var(--shadow-sm)] transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          ref={(node) => {
            if (node) buttons.current.set(option.value, node);
            else buttons.current.delete(option.value);
          }}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 whitespace-nowrap rounded-full font-semibold transition-colors duration-200 ${
            compact ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"
          } ${option.value === value ? "text-accent" : "text-ink-secondary hover:text-ink"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
