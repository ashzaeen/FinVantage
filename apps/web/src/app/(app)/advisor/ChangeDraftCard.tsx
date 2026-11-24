"use client";

import { Check, Mail, Pencil, Trash2, Undo2 } from "lucide-react";
import type { AdvisorAttachment } from "@finvantage/contracts";
import { buttonClass } from "@/components/ui/Button";
import { changes, useCanUndo, useChangeState } from "./change-drafts";

type Draft = Extract<AdvisorAttachment, { kind: "change_draft" }>;

/**
 * A change the Advisor proposed. Nothing is saved until the user confirms, by tapping Confirm or,
 * on a call and for anything that is not a removal, by saying yes. It goes through the same
 * route as the page for that data, and can be undone for a short while after.
 */
export function ChangeDraftCard({ id, draft, voice = false }: { id: string; draft: Draft; voice?: boolean }) {
  const state = useChangeState(id);
  const canUndo = useCanUndo(state);
  const busy = state.phase === "saving" || state.phase === "undoing";
  // Sending an email needs a tap too, but it is not a removal, so it is not drawn as one.
  const sends = draft.request.action === "email_report";
  const danger = draft.destructive && !sends;
  const Icon = sends ? Mail : danger ? Trash2 : Pencil;
  const confirmWords = draft.confirmLabel ?? (draft.destructive ? "Confirm Removal" : "Confirm");

  if (state.phase === "dismissed") return <p className="pl-1 text-xs text-muted">Dismissed. Nothing was saved.</p>;

  return (
    <section aria-label={draft.title} className="w-full rounded-2xl border border-line bg-card p-4 text-left shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-critical-bg text-loss" : "bg-accent-soft text-accent-ink"}`}>
          <Icon size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {state.phase === "saved" ? "Saved" : state.phase === "undone" ? "Undone" : "Proposed Change"}
          </p>
          <h3 className="font-poppins text-base font-semibold text-ink">{draft.title}</h3>
        </div>
      </div>

      <dl className="mt-3 divide-y divide-line text-sm">
        {draft.lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="shrink-0 text-muted">{line.label}</dt>
            <dd className="min-w-0 text-right font-medium text-ink">{line.value}</dd>
          </div>
        ))}
      </dl>

      {state.phase === "saved" || state.phase === "undone" ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className={`inline-flex items-center gap-1.5 text-sm ${state.phase === "saved" ? "text-gain" : "text-muted"}`}>
            {state.phase === "saved" && <Check size={15} aria-hidden />}
            {state.phase === "saved" ? "Saved." : "Undone. The change was reversed."}
          </p>
          {canUndo && (
            <button
              type="button"
              onClick={() => void changes.undo(id)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-ink transition hover:bg-inset lg:min-h-9"
            >
              <Undo2 size={14} aria-hidden /> Undo
            </button>
          )}
          {state.message && <p role="alert" className="text-xs text-loss">{state.message}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void changes.confirm(id, draft.request)}
            disabled={busy}
            className={danger ? "inline-flex min-h-11 items-center justify-center rounded-xl border border-critical bg-critical-bg px-4 text-sm font-bold text-loss disabled:opacity-60" : buttonClass()}
          >
            {state.phase === "saving" ? "Working…" : confirmWords}
          </button>
          <button
            type="button"
            onClick={() => changes.dismiss(id)}
            disabled={busy}
            className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium text-ink transition hover:bg-inset"
          >
            Cancel
          </button>
          {voice && (
            <p className="basis-full text-xs text-muted">
              {draft.destructive ? `Tap ${confirmWords} to go ahead. This is never done by voice alone.` : "Say yes to save it, or no to cancel."}
            </p>
          )}
          {state.phase === "error" && <p role="alert" className="basis-full text-xs text-loss">{state.message}</p>}
        </div>
      )}
    </section>
  );
}
