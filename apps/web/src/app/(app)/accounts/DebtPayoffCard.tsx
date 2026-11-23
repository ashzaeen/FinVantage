"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, type DebtPayoff, type PayoffPlan, type PayoffStrategy } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { compactUsd, monthYear, plural } from "@/lib/format";

const W = 520;
const H = 200;
const PAD = { left: 44, right: 12, top: 14, bottom: 22 };
const COLORS: Record<PayoffStrategy, string> = { avalanche: "var(--series-1)", snowball: "var(--series-3)" };
const NAMES: Record<PayoffStrategy, string> = { avalanche: "Highest Rate First", snowball: "Smallest Balance First" };
const STRATEGIES: PayoffStrategy[] = ["avalanche", "snowball"];

function Lines({ plans, chosen }: { plans: PayoffPlan[]; chosen: PayoffStrategy }) {
  const months = Math.max(2, ...plans.map((p) => p.balanceByMonth.length));
  const top = Math.max(1, ...plans.flatMap((p) => p.balanceByMonth));
  const x = (i: number) => PAD.left + (i / (months - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[30rem] max-w-[44rem]" role="img" aria-label={`Total debt over time under two plans. ${plans.map((p) => `${NAMES[p.strategy]}: ${p.payoffDate ? `paid off ${monthYear(p.payoffDate)}` : "not paid off within 30 years"}`).join(". ")}.`}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(top * t)} y2={y(top * t)} stroke="var(--border)" />
          <text x={PAD.left - 6} y={y(top * t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">{compactUsd(Math.round(top * t))}</text>
        </g>
      ))}
      {[...plans].sort((a, b) => Number(a.strategy === chosen) - Number(b.strategy === chosen)).map((p) => {
        const on = p.strategy === chosen;
        const last = p.balanceByMonth.length - 1;
        return (
          <g key={p.strategy}>
            <polyline points={p.balanceByMonth.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={COLORS[p.strategy]} strokeWidth={on ? 3 : 1.75} strokeOpacity={on ? 1 : 0.55} strokeDasharray={on ? undefined : "6 4"} strokeLinecap="round" strokeLinejoin="round" />
            {p.payoffDate && (
              <>
                <circle cx={x(last)} cy={y(p.balanceByMonth[last] ?? 0)} r={4} fill={COLORS[p.strategy]} />
                {/* When both orders finish in the same month, one label says so. */}
                {!(p.strategy === "snowball" && plans.find((q) => q.strategy === "avalanche")?.payoffDate === p.payoffDate) && (
                  <text x={x(last) - 8} y={y(0) - (p.strategy === "avalanche" ? 8 : 22)} textAnchor="end" fontSize={12} fontWeight={on ? 700 : 400} fill="var(--ink)">{monthYear(p.payoffDate)}</text>
                )}
              </>
            )}
          </g>
        );
      })}
      <text x={PAD.left} y={H - 5} fontSize={12} fill="var(--ink-muted)">Now</text>
    </svg></div>
  );
}

/** Two ways to clear cards and loans, with an optional extra payment each month. A suggestion; nothing is paid. */
export function DebtPayoffCard({ initial }: { initial: DebtPayoff }) {
  const [extra, setExtra] = useState("0");
  const [data, setData] = useState(initial);
  const [chosen, setChosen] = useState<PayoffStrategy>("avalanche");
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
  const plan = data.plans.find((p) => p.strategy === chosen);
  const other = STRATEGIES.find((s) => s !== chosen)!;

  return (
    <Card title="Paying Down Debt" subtitle="Two ways to clear your cards and loans. The mortgage is left out." lift={false}>
      <div className="flex flex-wrap items-end gap-4">
        <label className="block min-w-[10rem] max-w-xs flex-1 text-sm font-medium text-ink">Extra Per Month
          <div className="mt-2 flex h-11 items-center rounded-xl border border-line bg-surface px-3 focus-within:border-accent-ink">
            <span className="text-muted">$</span>
            <input type="number" inputMode="numeric" min={0} step={25} value={extra} onChange={(e) => setExtra(e.target.value)} className="w-full bg-transparent px-2 text-base text-ink outline-none" />
          </div>
        </label>
        <div role="group" aria-label="Payoff order" className="inline-flex rounded-xl bg-inset p-1">
          {STRATEGIES.map((s) => (
            <button key={s} type="button" aria-pressed={chosen === s} onClick={() => setChosen(s)} className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${chosen === s ? "bg-raised text-accent-ink shadow-sm" : "text-muted"}`}>
              {NAMES[s]}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      {data.plans.length > 0 && plan && (
        <div className="mt-4" role="status" aria-live="polite">
          <Lines plans={data.plans} chosen={chosen} />
          <p className="mt-1 text-xs text-muted">
            <span className="mr-3"><i aria-hidden="true" className="mr-1 inline-block h-0.5 w-4 align-middle" style={{ background: COLORS[chosen] }} />{NAMES[chosen]}: {formatUsd(plan.totalInterestCents)} interest</span>
            <span><i aria-hidden="true" className="mr-1 inline-block w-4 border-t-2 border-dashed align-middle" style={{ borderColor: COLORS[other] }} />{NAMES[other]}: {formatUsd(data.plans.find((p) => p.strategy === other)?.totalInterestCents ?? 0)} interest</span>
          </p>
          <p className="mt-3 text-sm text-ink">
            {data.avalancheSavesCents > 0
              ? <>Paying the highest rate first could save about <strong>{formatUsd(data.avalancheSavesCents)}</strong> in interest{data.avalancheFinishesSoonerMonths > 0 ? <> and finish <strong>{plural(data.avalancheFinishesSoonerMonths, "month")}</strong> sooner</> : null}.</>
              : <>Both orders cost about the same here, so pick the one that keeps you motivated.</>}
          </p>
          {plan.order.length > 0 && (
            <p className="mt-1 text-sm text-ink">
              Consider paying <strong>{plan.order[0]!.name}</strong> first.{" "}
              <span className="text-muted">Order: {plan.order.map((o) => `${o.name}${o.clearedInMonth ? ` (month ${o.clearedInMonth})` : ""}`).join(", then ")}.</span>
            </p>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">These are suggestions. Nothing is paid for you. Debts with no stated minimum are assumed to need 2% of the balance, at least $25.</p>
    </Card>
  );
}
