"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { formatUsd, type GoalImpact, type NewGoal } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { api } from "@/lib/api";
import { remembered, remember, type DraftState } from "./draft-state";

/**
 * A savings goal the Advisor proposed. Nothing is saved until the user presses Confirm, which
 * goes through the same route as the Goals page.
 */
export function GoalDraftCard({
  id,
  goal,
  probabilityLow,
  probabilityHigh,
  goalChanges,
}: {
  id: string;
  goal: NewGoal;
  probabilityLow: number | null;
  probabilityHigh: number | null;
  goalChanges: GoalImpact[];
}) {
  const [state, setState] = useState<DraftState>("draft");

  useEffect(() => {
    const prior = remembered(id);
    if (prior === "saved" || prior === "dismissed") setState(prior);
  }, [id]);

  async function confirm() {
    setState("saving");
    try {
      await api.createGoal({ body: goal });
      setState("saved");
      remember(id, "saved");
    } catch {
      setState("error");
    }
  }

  function dismiss() {
    setState("dismissed");
    remember(id, "dismissed");
  }

  if (state === "dismissed") return <p className="pl-1 text-xs text-muted">Draft dismissed. Nothing was saved.</p>;

  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Target size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{state === "saved" ? "Saved Goal" : "Draft Goal"}</p>
          <p className="font-poppins text-base font-semibold text-ink">{goal.name}</p>
          <p className="text-sm text-muted">
            {formatUsd(goal.targetCents)} by {goal.targetDate}
            {goal.currentCents > 0 ? ` · ${formatUsd(goal.currentCents)} saved` : ""} · {goal.flexibility === "flexible" ? "Flexible date" : "Fixed date"}
          </p>
        </div>
        {probabilityLow !== null && probabilityHigh !== null && (
          <div className="shrink-0 text-right">
            <ProbabilityRange low={probabilityLow} high={probabilityHigh} />
          </div>
        )}
      </div>

      {goalChanges.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <p className="text-xs text-muted">Your other goals would be:</p>
          {goalChanges.map((change) => (
            <div key={change.goalId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-medium text-ink">{change.goalName}</span>
              <ProbabilityRange low={change.probabilityLowAfter} high={change.probabilityHighAfter} note={false} />
            </div>
          ))}
        </div>
      )}

      {state !== "saved" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={state === "saving"}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {state === "saving" ? "Saving…" : "Confirm and Save"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={state === "saving"}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-inset"
          >
            Dismiss
          </button>
          {state === "error" && <p role="alert" className="text-xs text-critical">That didn&apos;t save. Please try again.</p>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-good">Saved to your goals.</p>
      )}
    </div>
  );
}
