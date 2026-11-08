"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import {
  formatUsd,
  LIFE_EVENT_LABEL,
  type GoalImpact,
  type LifeEventDraft,
} from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { api } from "@/lib/api";
import { remembered, remember, type DraftState } from "./draft-state";

/**
 * A life event the Advisor drafted from the conversation. Nothing is saved until the user
 * presses Confirm, which goes through the same route as the Life Events form.
 */
export function LifeEventDraftCard({ id, draft, goalChanges }: { id: string; draft: LifeEventDraft; goalChanges: GoalImpact[] }) {
  const [state, setState] = useState<DraftState>("draft");
  const [saved, setSaved] = useState<GoalImpact[] | null>(null);

  useEffect(() => {
    const prior = remembered(id);
    if (prior === "saved" || prior === "dismissed") setState(prior);
  }, [id]);

  async function confirm() {
    setState("saving");
    try {
      const result = await api.createLifeEvent({ body: draft });
      setSaved(result.goalChanges);
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

  if (state === "dismissed") {
    return <p className="pl-1 text-xs text-muted">Draft dismissed. Nothing was saved.</p>;
  }

  const amount = formatUsd(Math.abs(draft.dollarImpactCents));
  const changes = saved ?? goalChanges;

  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <CalendarPlus size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {state === "saved" ? "Saved Life Event" : "Draft Life Event"}
          </p>
          <p className="font-poppins text-base font-semibold text-ink">{LIFE_EVENT_LABEL[draft.type]}</p>
          <p className="text-sm text-muted">
            {draft.date} · {draft.dollarImpactCents < 0 ? "costs" : "adds"} {amount}
            {draft.recurrence === "recurring" ? " a month" : " once"}
            {draft.durationMonths ? ` for ${draft.durationMonths} months` : ""}
          </p>
        </div>
      </div>

      {changes.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <p className="text-xs text-muted">{state === "saved" ? "Your goals now:" : "If you save it, your goals would be:"}</p>
          {changes.map((change) => (
            <div key={change.goalId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-medium text-ink">{change.goalName}</span>
              <ProbabilityRange low={change.probabilityLowAfter} high={change.probabilityHighAfter} note={false} />
            </div>
          ))}
          <p className="text-xs text-muted">Educational estimates, not guarantees.</p>
        </div>
      )}

      {state !== "saved" && (
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
          {state === "error" && <p role="alert" className="text-xs text-critical">That didn't save. Please try again.</p>}
        </div>
      )}
    </div>
  );
}
