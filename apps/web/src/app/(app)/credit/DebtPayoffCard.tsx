"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, type DebtPayoff, type PayoffPlan } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { compactUsd, monthYear } from "@/lib/format";

const W = 520;
const H = 190;
const PAD = { left: 44, right: 10, top: 10, bottom: 22 };
const COLORS: Record<string, string> = { avalanche: "var(--series-1)", snowball: "var(--flow-out)" };
const NAMES: Record<string, string> = { avalanche: "Highest Rate First", snowball: "Smallest Balance First" };

function Lines({ plans }: { plans: PayoffPlan[] }) {
  const months = Math.max(2, ...plans.map((p) => p.balanceByMonth.length));
  const top = Math.max(1, ...plans.flatMap((p) => p.balanceByMonth));
  const x = (i: number) => PAD.left + (i / (months - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Total debt over time under two plans. ${plans.map((p) => `${NAMES[p.strategy]}: ${p.payoffDate ? `paid off ${monthYear(p.payoffDate)}` : "not paid off within 30 years"}`).join(". ")}.`}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(top * t)} y2={y(top * t)} stroke="var(--border)" />
          <text x={PAD.left - 6} y={y(top * t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">{compactUsd(Math.round(top * t))}</text>
        </g>
      ))}
      {plans.map((p) => (
        <polyline key={p.strategy} points={p.balanceByMonth.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={COLORS[p.strategy]} strokeWidth={2.5} strokeDasharray={p.strategy === "snowball" ? "6 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <text x={PAD.left} y={H - 5} fontSize={12} fill="var(--ink-muted)">Now</text>
      <text x={W - PAD.right} y={H - 5} textAnchor="end" fontSize={12} fill="var(--ink-muted)">Month {months - 1}</text>
    </svg>
  );
}

/** Two ways to clear cards and loans, with an optional extra payment each month. A suggestion; nothing is paid. */
export function DebtPayoffCard({ initial }: { initial: DebtPayoff }) {
  const [extra, setExtra] = useState("0");
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const dollars = Math.max(0, Math.min(1_000_000, Math.floor(Number(extra) || 0)));
    let live = true;
    const timer = setTimeout(() => {
      api.getDebtPayoff({ query: { extraCents: dollars * 100 } })
        .then((r) => { if (live) { setData(r); setError(""); } })
        .catch(() => { if (live) setError("Could not update the plans right now."); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [extra]);

  if (initial.debts.length === 0) return null;
  const [avalanche, snowball] = [data.plans.find((p) => p.strategy === "avalanche"), data.plans.find((p) => p.strategy === "snowball")];

  return (
    <Card title="Paying Down Debt" subtitle="Two ways to clear your cards and loans. The mortgage is left out." lift={false}>
      <label className="block max-w-xs text-sm font-medium text-ink">Extra Per Month
        <div className="mt-2 flex h-11 items-center rounded-xl border border-line bg-surface px-3 focus-within:border-accent-ink">
          <span className="text-muted">$</span>
          <input type="number" inputMode="numeric" min={0} step={25} value={extra} onChange={(e) => setExtra(e.target.value)} className="w-full bg-transparent px-2 text-base text-ink rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink" />
        </div>
      </label>
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      {data.plans.length > 0 && (
        <div className="mt-4" role="status" aria-live="polite">
          <Lines plans={data.plans} />
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
            {data.plans.map((p) => (
              <li key={p.strategy} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block w-5 border-t-2" style={{ borderColor: COLORS[p.strategy], borderStyle: p.strategy === "snowball" ? "dashed" : "solid" }} />
                {NAMES[p.strategy]}: {p.payoffDate ? `clear by ${monthYear(p.payoffDate)}` : "over 30 years"}, {formatUsd(p.totalInterestCents)} interest
              </li>
            ))}
          </ul>
          {data.avalancheSavesCents > 0 && avalanche && (
            <p className="mt-3 text-sm text-ink">Paying the highest rate first could save about <strong>{formatUsd(data.avalancheSavesCents)}</strong> in interest. Consider paying {avalanche.order[0]?.name ?? "it"} first.</p>
          )}
          {data.avalancheSavesCents === 0 && snowball && <p className="mt-3 text-sm text-ink">Both orders cost about the same here, so pick the one that keeps you motivated.</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">These are suggestions. Nothing is paid for you. Debts with no stated minimum are assumed to need 2% of the balance, at least $25.</p>
    </Card>
  );
}
