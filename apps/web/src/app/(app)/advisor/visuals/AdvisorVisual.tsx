"use client";

import { useState } from "react";
import { formatUsd, type AdvisorVisual as Visual } from "@finvantage/contracts";
import { compareRows, difference } from "@/lib/visualCompare";
import { CardEvaluator } from "./CardEvaluator";
import { GoalPlanner } from "./GoalPlanner";
import { GrowthCompare } from "./GrowthCompare";
import { LoanExplorer } from "./LoanExplorer";

/** Picks the interactive visual for an Advisor answer. */
function Single({ visual, id, onVisual }: { visual: Visual; id: string; onVisual?: (v: Visual) => void }) {
  switch (visual.kind) {
    case "loan_explorer":
      return <LoanExplorer initial={visual} onVisual={onVisual} />;
    case "goal_plan":
      return <GoalPlanner initial={visual} id={id} onVisual={onVisual} />;
    case "growth_compare":
      return <GrowthCompare initial={visual} onVisual={onVisual} />;
    case "card_evaluator":
      return <CardEvaluator initial={visual} onVisual={onVisual} />;
  }
}

function Difference({ a, b }: { a: Visual; b: Visual }) {
  const rows = compareRows(a, b);
  if (rows.length === 0) return null;
  return (
    <div role="region" aria-label="Difference between the two scenarios" aria-live="polite" className="rounded-2xl border border-line bg-inset p-4">
      <h3 className="text-sm font-semibold text-ink">What Changes From A to B</h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr><th scope="col" className="pb-1 font-medium">Figure</th><th scope="col" className="pb-1 text-right font-medium">A</th><th scope="col" className="pb-1 text-right font-medium">B</th><th scope="col" className="pb-1 text-right font-medium">B vs A</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const diff = difference(row);
            return (
              <tr key={row.label} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-medium text-ink">{row.label}</th>
                <td className="py-1.5 text-right tabular-nums text-ink">{row.a === null ? "N/A" : formatUsd(row.a)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">{row.b === null ? "N/A" : formatUsd(row.b)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums text-ink">
                  {diff === null ? "N/A" : diff === 0 ? "Same" : `${diff > 0 ? "▲ " : "▼ "}${formatUsd(Math.abs(diff))}`}
                  <span className="sr-only">{diff === null ? "" : diff > 0 ? " higher in B" : diff < 0 ? " lower in B" : ""}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Both scenarios use the same figures as the visuals above, worked out by the app. Adjust either one to see this change.</p>
    </div>
  );
}

/**
 * An Advisor visual, with an option to compare a second scenario of the same kind beside it. The
 * second starts as a copy and has its own controls. The difference is B minus A on the headline
 * figures, and nothing is saved.
 */
export function AdvisorVisual({ visual, id }: { visual: Visual; id: string }) {
  const [comparing, setComparing] = useState(false);
  const [a, setA] = useState<Visual>(visual);
  const [b, setB] = useState<Visual>(visual);
  // Where both scenarios start: what is on screen when Compare is pressed, so edits are not lost.
  const [seed, setSeed] = useState<Visual>(visual);

  return (
    <div className="space-y-3">
      {comparing ? (
        <>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
            <div className="min-w-0"><p className="mb-1 text-xs font-semibold text-muted">Scenario A</p><Single visual={seed} id={id} onVisual={setA} /></div>
            <div className="min-w-0"><p className="mb-1 text-xs font-semibold text-muted">Scenario B</p><Single visual={seed} id={`${id}:b`} onVisual={setB} /></div>
          </div>
          <Difference a={a} b={b} />
        </>
      ) : (
        <Single visual={seed} id={id} onVisual={setA} />
      )}
      <button
        type="button"
        aria-pressed={comparing}
        onClick={() => { setSeed(a); setB(a); setComparing((on) => !on); }}
        className="min-h-11 rounded-xl border border-line bg-raised px-4 text-sm font-semibold text-ink-secondary hover:border-accent-ink hover:text-accent-ink"
      >
        {comparing ? "Show One Scenario" : "Compare Two Scenarios"}
      </button>
    </div>
  );
}
