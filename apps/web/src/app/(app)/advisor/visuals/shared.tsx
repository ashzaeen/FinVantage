"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AdvisorVisual, AdvisorVisualRequest } from "@finvantage/contracts";
import { api } from "@/lib/api";

/*
 * The building blocks every Advisor visual shares, in the landing page's Try a Purchase style:
 * a floating white card, pill chips, a hero figure, a before/after strip between hairlines, and
 * one-hue charts with a hover caption. Every figure comes from the API.
 */

/** Keeps the visual in sync with the API: change inputs, and the figures come back recomputed. */
export function useVisual<V extends AdvisorVisual>(initial: V) {
  const [visual, setVisual] = useState<V>(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((inputs: V["inputs"]) => {
    // The controls show the new value at once; the figures follow when the API answers.
    setVisual((v) => ({ ...v, inputs }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++latest.current;
      setPending(true);
      try {
        const next = await api.renderAdvisorVisual({ body: { kind: initial.kind, inputs } as AdvisorVisualRequest });
        if (id === latest.current) {
          setVisual(next as V);
          setFailed(false);
        }
      } catch {
        if (id === latest.current) setFailed(true);
      } finally {
        if (id === latest.current) setPending(false);
      }
    }, 280);
  }, [initial.kind]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { visual, update, pending, failed };
}

/** Animates between the old and new arrays of numbers, so charts glide instead of jumping. */
export function useTween(target: number[], duration = 320): number[] {
  const [values, setValues] = useState(target);
  const from = useRef(target);
  const key = target.join(",");

  useEffect(() => {
    const start = from.current;
    if (start.length !== target.length) {
      from.current = target;
      setValues(target);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const ease = 1 - (1 - t) ** 3;
      const next = target.map((v, i) => start[i]! + (v - start[i]!) * ease);
      setValues(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return values;
}

/** A figure that counts to its new value. `format` turns the API's number into text. */
export function Ticker({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown] = useTween([value]);
  return <span className="tabular-nums">{format(Math.round(shown ?? value))}</span>;
}

export function VisualCard({ children, pending, failed, label }: { children: ReactNode; pending: boolean; failed: boolean; label: string }) {
  return (
    <section
      aria-label={label}
      aria-busy={pending}
      className="advisor-visual-enter relative w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-card shadow-[var(--shadow-float)]"
    >
      <div className={`p-4 transition-opacity duration-200 sm:p-5 ${pending ? "opacity-60" : "opacity-100"}`}>{children}</div>
      {pending && <div className="advisor-visual-progress absolute inset-x-0 top-0 h-0.5 bg-accent" aria-hidden />}
      {failed && <p role="alert" className="px-5 pb-3 text-xs text-critical">Couldn&apos;t update just now. Try again in a moment.</p>}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-muted">{children}</p>;
}

/** The landing page's pill chips: the selected one gets an ink outline. */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  render?: (option: T) => ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`h-9 rounded-full border px-3.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
            option === value
              ? "border-ink bg-card font-medium text-ink shadow-sm"
              : "border-line bg-card text-[var(--ink-secondary)] hover:border-[var(--ink-light)]"
          }`}
        >
          {render ? render(option) : option}
        </button>
      ))}
    </div>
  );
}

/** A labeled range control. The value shown is the user's choice, not a computed figure. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display: string;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums text-ink">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="advisor-range mt-2 w-full"
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
      />
    </label>
  );
}

/** The before/after strip between two hairlines. */
export function Strip({ children }: { children: ReactNode }) {
  return <div className="mt-3 grid grid-cols-1 gap-3 border-y border-line py-3 sm:grid-cols-2">{children}</div>;
}

/** A show-or-hide table so every chart's numbers are readable without the chart. */
export function TableToggle({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-accent hover:underline" aria-expanded={open}>
        {open ? "Hide Table" : "Show Table"}
      </button>
      {open && (
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-inset text-muted">
              <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-ink">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export interface Band {
  /** Lower and upper edges, one pair per point. */
  lower: number[];
  upper: number[];
  fill: string;
}

export interface Line {
  values: number[];
  stroke: string;
  width?: number;
}

/**
 * The landing page's fan look as a reusable chart: layered one-hue bands, a 2px line on top, a
 * thin crosshair on hover, and the reading in a caption below instead of a floating tooltip.
 */
export function FanArea({
  bands,
  lines,
  count,
  height = 170,
  caption,
  defaultCaption,
  startLabel,
  endLabel,
  markers = [],
  ariaLabel,
  fit = false,
}: {
  /** Scale to the data's own range instead of from zero, so a narrow fan reads clearly. */
  fit?: boolean;
  bands: Band[];
  lines: Line[];
  count: number;
  height?: number;
  caption: (index: number) => string;
  defaultCaption: string;
  startLabel: string;
  endLabel: string;
  /** Dots by point index, in the accent unless a color is given. */
  markers?: Array<{ index: number; value: number; emphasis?: boolean; color?: string }>;
  ariaLabel: string;
}) {
  const WIDTH = 640;
  const PAD = { top: 10, right: 10, bottom: 24, left: 10 };
  const [hover, setHover] = useState<number | null>(null);

  const flat = [...bands.flatMap((b) => [...b.lower, ...b.upper]), ...lines.flatMap((l) => l.values)];
  const animated = useTween(flat);
  let cursor = 0;
  const take = (n: number) => {
    const out = animated.slice(cursor, cursor + n);
    cursor += n;
    return out;
  };
  const tweenBands = bands.map((b) => ({ ...b, lower: take(b.lower.length), upper: take(b.upper.length) }));
  const tweenLines = lines.map((l) => ({ ...l, values: take(l.values.length) }));

  const top = Math.max(1, ...flat);
  const floor = fit ? Math.max(0, Math.min(...flat) - (top - Math.min(...flat)) * 0.08) : 0;
  const max = floor + (top - floor) * 1.06;
  const x = (i: number) => PAD.left + (count <= 1 ? 0 : (i / (count - 1)) * (WIDTH - PAD.left - PAD.right));
  const y = (v: number) => height - PAD.bottom - ((Math.max(floor, v) - floor) / (max - floor || 1)) * (height - PAD.top - PAD.bottom);
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = (lower: number[], upper: number[]) =>
    `${path(upper)} ${[...lower].reverse().map((v, i) => `L${x(lower.length - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} Z`;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.round(Math.min(1, Math.max(0, ratio)) * (count - 1)));
  }

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full touch-none select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          if (!touch) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(Math.min(1, Math.max(0, (touch.clientX - rect.left) / rect.width)) * (count - 1)));
        }}
      >
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={height - PAD.bottom} y2={height - PAD.bottom} stroke="var(--border)" />
        {tweenBands.map((b, i) => <path key={i} d={area(b.lower, b.upper)} fill={b.fill} />)}
        {tweenLines.map((l, i) => (
          <path key={i} d={path(l.values)} fill="none" stroke={l.stroke} strokeWidth={l.width ?? 2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {markers.map((m, i) => (
          <circle
            key={`${m.index}-${i}`}
            cx={x(m.index)}
            cy={y(m.value)}
            r={m.emphasis ? 5.5 : 4}
            fill={m.emphasis ? (m.color ?? "var(--accent)") : "var(--surface-card)"}
            stroke={m.emphasis ? "var(--surface-card)" : (m.color ?? "var(--accent)")}
            strokeWidth={2}
          />
        ))}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--ink-light)" />
            {tweenLines.map((l, i) => (
              <circle key={i} cx={x(hover)} cy={y(l.values[hover] ?? 0)} r={i === 0 ? 5 : 4} fill={l.stroke} stroke="var(--surface-card)" strokeWidth={2} />
            ))}
          </>
        )}
        <text x={PAD.left} y={height - 6} fontSize={11} fill="var(--ink-muted)">{startLabel}</text>
        <text x={WIDTH - PAD.right} y={height - 6} fontSize={11} fill="var(--ink-muted)" textAnchor="end">{endLabel}</text>
      </svg>
      <figcaption className="mt-1 min-h-4 text-xs tabular-nums text-muted">{hover === null ? defaultCaption : caption(hover)}</figcaption>
    </figure>
  );
}

/** A small ring for a share from 0 to 1, in the accent. */
export function Ring({ share, size = 44 }: { share: number; size?: number }) {
  const [shown] = useTween([share]);
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent-soft)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, Math.max(0, shown ?? 0))} ${c}`}
      />
    </svg>
  );
}
