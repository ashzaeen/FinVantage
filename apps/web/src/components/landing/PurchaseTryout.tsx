"use client";

import { useEffect, useState } from "react";
import { formatUsd, type Goal, type SimulationRun } from "@finvantage/contracts";
import { FanChart } from "@/components/finance/FanChart";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { api } from "@/lib/api";

/** Example purchases a visitor can try. They are simulator inputs, not results. */
const PURCHASES = [
  { id: "laptop", label: "A New Laptop", amountCents: 149_900 },
  { id: "sofa", label: "A New Sofa", amountCents: 280_000 },
  { id: "car", label: "A Used Car", amountCents: 1_800_000 },
] as const;

type PurchaseId = (typeof PURCHASES)[number]["id"];

type Tryout =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; goal: Goal; baseline: SimulationRun; runs: Record<PurchaseId, SimulationRun> };

function preview(amountCents: number) {
  return api.runSimulation({
    body: {
      persist: false,
      whatIf: { monthlySavingsDeltaCents: 0, purchaseAmountCents: amountCents, eventShifts: [] },
    },
  });
}

/**
 * The hero's proof of the headline: pick a purchase and watch the biggest goal's forecast move.
 * Every number is a real simulator run on the demo profile, and nothing is stored.
 */
export function PurchaseTryout() {
  const [selected, setSelected] = useState<PurchaseId>("sofa");
  const [state, setState] = useState<Tryout>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listGoals(), preview(0), ...PURCHASES.map((p) => preview(p.amountCents))])
      .then(([goals, baseline, ...runs]) => {
        // The biggest goal has the widest range of outcomes, so the effect is easy to see.
        const goal = [...goals].sort((a, b) => b.targetCents - a.targetCents)[0];
        if (cancelled) return;
        if (!goal) return setState({ status: "error" });
        const byId = Object.fromEntries(PURCHASES.map((p, i) => [p.id, runs[i]!])) as Record<PurchaseId, SimulationRun>;
        setState({ status: "ready", goal, baseline, runs: byId });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const purchase = PURCHASES.find((p) => p.id === selected)!;

  return (
    <div className="max-w-[560px]">
      <p className="text-sm font-medium text-ink">Try a Purchase</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Try a purchase">
        {PURCHASES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            aria-pressed={p.id === selected}
            className={`h-10 rounded-full border px-4 text-sm transition-colors ${
              p.id === selected
                ? "border-ink bg-white font-medium text-ink"
                : "border-line bg-white text-[var(--ink-secondary)] hover:border-[var(--ink-light)]"
            }`}
          >
            {p.label} <span className="tabular-nums text-muted">{formatUsd(p.amountCents)}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-float)]">
        {state.status === "loading" && (
          <div className="animate-pulse" aria-label="Loading the forecast">
            <div className="h-4 w-40 rounded bg-inset" />
            <div className="mt-4 h-10 w-full rounded bg-inset" />
            <div className="mt-3 h-20 w-full rounded bg-inset" />
          </div>
        )}
        {state.status === "error" && (
          <p className="text-sm text-muted">The live forecast is offline right now. Try the demo to see it.</p>
        )}
        {state.status === "ready" && <Forecast state={state} purchaseId={selected} purchaseLabel={purchase.label} />}
      </div>
    </div>
  );
}

function Forecast({
  state,
  purchaseId,
  purchaseLabel,
}: {
  state: Extract<Tryout, { status: "ready" }>;
  purchaseId: PurchaseId;
  purchaseLabel: string;
}) {
  const before = state.baseline.goalOutcomes.find((o) => o.goalId === state.goal.id);
  const after = state.runs[purchaseId].goalOutcomes.find((o) => o.goalId === state.goal.id);
  if (!before || !after) return <p className="text-sm text-muted">Add a goal to see its forecast.</p>;

  return (
    <>
      <p className="text-sm text-muted">Your Biggest Goal</p>
      <h2 className="mt-0.5 text-lg font-semibold text-ink">{state.goal.name}</h2>
      <div className="mt-2 grid grid-cols-2 gap-4 border-y border-line py-2.5">
        <div>
          <p className="mb-1 text-xs text-muted">Today</p>
          <ProbabilityRange low={before.probabilityLow} high={before.probabilityHigh} note={false} />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted">After {purchaseLabel.replace(/^A /, "a ")}</p>
          <ProbabilityRange low={after.probabilityLow} high={after.probabilityHigh} />
        </div>
      </div>
      <FanChart points={after.fan} height={150} className="mt-2" />
    </>
  );
}
