"use client";

import { useEffect, useState } from "react";
import { formatUsd, type LifeScenario, type LifeScenarioAnalysis } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { EVENT_LABEL, formatDate, formForCurrentContext } from "./lifeSimulatorShared";

const nameOf = (s: LifeScenario) => s.name || (s.eventType === "custom" ? s.customEventName || "Your Event" : EVENT_LABEL[s.eventType]);

function Column({ title, a }: { title: string; a: LifeScenarioAnalysis }) {
  const x = a.analysis;
  return (
    <div className="min-w-0 rounded-xl p-4" style={{ background: "var(--surface-inset)" }}>
      <h3 className="truncate font-semibold text-ink">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Monthly cost</dt><dd className="font-semibold tabular-nums text-ink">{formatUsd(x.monthlyCostsCents)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">One-time cost</dt><dd className="font-semibold tabular-nums text-ink">{formatUsd(x.oneTimeCostsCents)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Free cash a month</dt><dd className="font-semibold tabular-nums text-ink">{formatUsd(x.freeCashBeforeCents)} to {formatUsd(x.freeCashAfterCents)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Goals delayed</dt><dd className="font-semibold tabular-nums text-ink">{x.goalsDelayed} of {x.goalsDelayed + x.goalsUnchanged}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Most affected</dt><dd className="text-right font-semibold text-ink">{x.mostAffectedGoalName ? `${x.mostAffectedGoalName}, ${x.mostAffectedDelayLabel}` : "None"}</dd></div>
      </dl>
      <h4 className="mt-4 text-xs font-semibold text-muted">Goal Funding Dates</h4>
      <ul className="mt-1 space-y-1 text-xs text-ink">
        {a.goals.filter((g) => g.included).map((g) => (
          <li key={g.goalId} className="flex justify-between gap-3"><span className="truncate">{g.name}</span><span className="shrink-0 tabular-nums">{formatDate(g.beforeDisplayDate)} to {formatDate(g.displayDate)}</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Two saved events, side by side, each worked out by the API against today's goals. Saves nothing. */
export function CompareEvents() {
  const [saved, setSaved] = useState<LifeScenario[] | null>(null);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [results, setResults] = useState<{ a: LifeScenarioAnalysis; b: LifeScenarioAnalysis } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api.listLifeScenarios().then((items) => {
      if (!live) return;
      setSaved(items);
      setLeft(items[0]?.id ?? "");
      setRight(items[1]?.id ?? "");
    }).catch(() => { if (live) setSaved([]); });
    return () => { live = false; };
  }, []);

  if (saved === null || saved.length < 2) {
    return saved === null ? null : (
      <Card title="Compare Two Events" subtitle="Side by side, against your current goals" lift={false}>
        <p className="text-sm text-muted">Save at least two models to compare them. You have {saved.length}.</p>
      </Card>
    );
  }

  async function compare() {
    setBusy(true);
    setError("");
    try {
      const current = await api.getLifeSimulatorContext();
      if (current.goals.length === 0) throw new Error("Add a goal before comparing events.");
      const run = async (id: string) => {
        const { id: _id, name: _n, status: _s, createdAt: _c, updatedAt: _u, userId: _uid, appliedLifeEventIds: _l, appliedGoalTargetDates: _g, ...input } = await api.getLifeScenario({ params: { id } });
        return api.analyzeLifeScenario({ body: formForCurrentContext(input, current) });
      };
      const [a, b] = await Promise.all([run(left), run(right)]);
      setResults({ a, b });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compare these events.");
    } finally {
      setBusy(false);
    }
  }

  const select = (label: string, value: string, set: (v: string) => void) => (
    <label className="block text-sm font-medium text-ink">{label}
      <select value={value} onChange={(e) => { set(e.target.value); setResults(null); }} className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent-ink">
        {saved.map((s) => <option key={s.id} value={s.id}>{nameOf(s)}</option>)}
      </select>
    </label>
  );
  const nameFor = (id: string) => nameOf(saved.find((s) => s.id === id)!);

  return (
    <Card title="Compare Two Events" subtitle="Side by side, against your current goals" lift={false}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {select("First Event", left, setLeft)}
        {select("Second Event", right, setRight)}
        <button type="button" disabled={busy || left === right} onClick={() => void compare()} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? "Comparing…" : "Compare"}</button>
      </div>
      {left === right && <p className="mt-2 text-xs text-muted">Pick two different events.</p>}
      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      {results && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2" aria-live="polite">
          <Column title={nameFor(left)} a={results.a} />
          <Column title={nameFor(right)} a={results.b} />
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Projections are estimates, not guarantees. Nothing here is saved.</p>
    </Card>
  );
}
