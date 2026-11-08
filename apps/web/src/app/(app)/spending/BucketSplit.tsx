"use client";

import { useState, type FormEvent } from "react";
import {
  ApiError,
  SPENDING_BUCKET_LABEL,
  formatPercent,
  formatUsd,
  type BucketSummary,
  type BudgetedBucket,
} from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";

const BUCKET_HINT: Record<BudgetedBucket, string> = {
  needs: "Housing, bills, groceries, debt payments",
  wants: "Dining, shopping, entertainment, travel",
  savings: "Savings, investing, retirement",
};

/** This month's Needs, Wants and Savings against the user's split, which they can edit. */
export function BucketSplit({ initial }: { initial: BucketSummary }) {
  const [summary, setSummary] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toPercents(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const total = draft.needs + draft.wants + draft.savings;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateSpendingSplit({
        body: { needs: draft.needs / 100, wants: draft.wants / 100, savings: draft.savings / 100 },
      });
      setSummary(await api.getBucketSummary());
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 400 ? "The three shares must add up to 100%." : "Could not save your split. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Needs, Wants and Savings"
      subtitle={`${summary.month} · of ${formatUsd(summary.incomeCents)} monthly income`}
      action={
        !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(toPercents(summary));
              setEditing(true);
            }}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--border)", color: "var(--ink)" }}
          >
            Edit Split
          </button>
        )
      }
    >
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {(["needs", "wants", "savings"] as const).map((bucket) => (
              <label key={bucket} className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
                {SPENDING_BUCKET_LABEL[bucket]}
                <span className="mt-1.5 flex items-center gap-1 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={draft[bucket]}
                    onChange={(e) => setDraft({ ...draft, [bucket]: Number(e.target.value) })}
                    className="w-full bg-transparent text-sm tabular-nums outline-none"
                    style={{ color: "var(--ink)" }}
                  />
                  <span style={{ color: "var(--ink-muted)" }}>%</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs" style={{ color: total === 100 ? "var(--ink-muted)" : "var(--critical)" }}>
            Total {total}%{total === 100 ? "" : ". The three shares must add up to 100%."}
          </p>
          {error && <p className="text-xs" style={{ color: "var(--critical)" }}>{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || total !== 100}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? "Saving…" : "Save Split"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-4 py-2 text-sm" style={{ color: "var(--ink-muted)" }}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <ul className="space-y-4">
          {summary.buckets.map((row) => {
            const over = row.spentCents > row.targetCents;
            const width = row.targetCents > 0 ? Math.min(100, (row.spentCents / row.targetCents) * 100) : 0;
            return (
              <li key={row.bucket}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium" style={{ color: "var(--ink)" }}>
                    {SPENDING_BUCKET_LABEL[row.bucket]}
                    <span className="ml-2 text-xs font-normal" style={{ color: "var(--ink-muted)" }}>
                      Target {formatPercent(summary.split[row.bucket])}
                    </span>
                  </span>
                  <span className="tabular-nums text-xs" style={{ color: over ? "var(--critical)" : "var(--ink-muted)" }}>
                    {formatUsd(row.spentCents)} of {formatUsd(row.targetCents)}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                  <div className="h-2.5 rounded-full" style={{ width: `${width}%`, background: over ? "var(--critical)" : "var(--accent)" }} />
                </div>
                <p className="mt-1 flex justify-between text-xs" style={{ color: "var(--ink-muted)" }}>
                  <span>{BUCKET_HINT[row.bucket]}</span>
                  <span className="tabular-nums">{formatPercent(row.shareOfIncome)} of income</span>
                </p>
              </li>
            );
          })}
          {summary.uncategorizedCents > 0 && (
            <li className="text-xs" style={{ color: "var(--ink-muted)" }}>
              {formatUsd(summary.uncategorizedCents)} has no category yet, so it is not in any bucket.
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function toPercents(summary: BucketSummary) {
  return {
    needs: Math.round(summary.split.needs * 100),
    wants: Math.round(summary.split.wants * 100),
    savings: Math.round(summary.split.savings * 100),
  };
}
