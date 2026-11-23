"use client";

import { useEffect, useState } from "react";
import { formatUsd, type CashForecast, type StressResult } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { compactUsd, monthYear } from "@/lib/format";

const W = 560;
const H = 200;
const PAD = { left: 48, right: 12, top: 10, bottom: 22 };

const SWITCHES = [
  { key: "incomeDropShare", label: "Income Down 20%", value: 0.2 },
  { key: "rentRiseShare", label: "Rent Up 10%", value: 0.1 },
] as const;

/** A band from the 10th to the 90th percentile, with the middle line. */
function Band({ f, color, dashed = false, x, y }: { f: CashForecast; color: string; dashed?: boolean; x: (i: number) => number; y: (v: number) => number }) {
  const top = f.months.map((m, i) => `${x(i)},${y(m.p90Cents)}`);
  const bottom = f.months.map((m, i) => `${x(i)},${y(m.p10Cents)}`).reverse();
  return (
    <g>
      <polygon points={[...top, ...bottom].join(" ")} fill={dashed ? "none" : color} fillOpacity={dashed ? 0 : 0.18} stroke={dashed ? "var(--ink-muted)" : "none"} strokeDasharray={dashed ? "5 4" : undefined} strokeWidth={1.5} />
      {!dashed && <polyline points={f.months.map((m, i) => `${x(i)},${y(m.p50Cents)}`).join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />}
    </g>
  );
}

/** Free cash for the next 24 months as a range, and what it does to the goals when income falls or rent rises. */
export function CashForecastCard() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<StressResult | null>(null);
  const [error, setError] = useState("");
  const income = on.incomeDropShare ? 0.2 : 0;
  const rent = on.rentRiseShare ? 0.1 : 0;

  useEffect(() => {
    let live = true;
    api.stressTest({ body: { incomeDropShare: income, rentRiseShare: rent } })
      .then((r) => { if (live) { setResult(r); setError(""); } })
      .catch(() => { if (live) setError("Could not work out the forecast right now."); });
    return () => { live = false; };
  }, [income, rent]);

  if (!result) return error ? <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>{error}</p> : null;
  const stressed = income > 0 || rent > 0;
  const shown = stressed ? result.stressedCash : result.baselineCash;
  const all = [...result.baselineCash.months, ...(stressed ? result.stressedCash.months : [])];
  const lo = Math.min(0, ...all.map((m) => m.p10Cents));
  const hi = Math.max(1, ...all.map((m) => m.p90Cents));
  const count = shown.months.length;
  const x = (i: number) => PAD.left + (i / (count - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const first = shown.months[0]!;
  const last = shown.months.at(-1)!;

  return (
    <Card title="Cash Forecast and Stress Test" subtitle="Free cash each month for two years, before any goes to a goal" lift={false}>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Stress switches">
        {SWITCHES.map((s) => (
          <button key={s.key} type="button" aria-pressed={Boolean(on[s.key])} onClick={() => setOn((o) => ({ ...o, [s.key]: !o[s.key] }))}
            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${on[s.key] ? "border-accent-ink bg-accent-soft text-accent-ink" : "border-line bg-raised text-ink-secondary"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="mb-2 text-sm text-ink">
        {stressed
          ? <>Savings would change by <strong>{formatUsd(result.monthlyChangeCents)}</strong> a month. In month one free cash is likely between {formatUsd(first.p10Cents)} and {formatUsd(first.p90Cents)}.</>
          : <>In month one free cash is likely between {formatUsd(first.p10Cents)} and {formatUsd(first.p90Cents)}. By {monthYear(last.date)} it is likely between {formatUsd(last.p10Cents)} and {formatUsd(last.p90Cents)}.</>}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Free cash a month, ${monthYear(first.date)} to ${monthYear(last.date)}: likely range ${formatUsd(last.p10Cents)} to ${formatUsd(last.p90Cents)} at the end.`}>
        {[hi, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-muted)">{compactUsd(v)}</text>
          </g>
        ))}
        {stressed && <Band f={result.baselineCash} color="var(--ink-muted)" dashed x={x} y={y} />}
        <Band f={shown} color={stressed ? "var(--flow-out)" : "var(--series-1)"} x={x} y={y} />
        <text x={PAD.left} y={H - 5} fontSize={11} fill="var(--ink-muted)">{monthYear(first.date)}</text>
        <text x={W - PAD.right} y={H - 5} textAnchor="end" fontSize={11} fill="var(--ink-muted)">{monthYear(last.date)}</text>
      </svg>
      <p className="mt-1 text-xs text-muted">The line is the middle case; the band runs from a weak case to a strong one.{stressed ? " The dashed outline is today's plan." : ""}</p>

      {stressed && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">Your Goals Under Stress</h3>
          <ul className="mt-2 space-y-2">
            {result.goals.map((g) => (
              <li key={g.goalId} className="grid grid-cols-1 gap-2 rounded-xl p-3 sm:grid-cols-[1fr_1fr_1fr] sm:items-center" style={{ background: "var(--surface-inset)" }}>
                <span className="truncate text-sm font-medium text-ink">{g.name}</span>
                <div><p className="text-[11px] text-muted">Today</p><ProbabilityRange low={g.before.low} high={g.before.high} note={false} /></div>
                <div><p className="text-[11px] text-muted">Under stress</p><ProbabilityRange low={g.after.low} high={g.after.high} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        How this is worked out: the change is income ({formatUsd(result.monthlyIncomeCents)} a month) times the drop, plus usual rent ({formatUsd(result.monthlyRentCents)} a month) times the rise, taken straight out of monthly savings. Nothing is saved or changed.
      </p>
    </Card>
  );
}
