"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd, type BudgetSuggestion } from "@finvantage/contracts";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { buttonClass } from "@/components/ui/Button";

/** Limits worth setting, from the last three full months. Nothing is saved until Add This Limit is pressed. */
export function BudgetSuggestions({ suggestions, labels }: { suggestions: BudgetSuggestion[]; labels: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState("");

  const rows = suggestions.filter((s) => !added.includes(s.category));
  if (rows.length === 0 && added.length === 0) return null;

  async function add(s: BudgetSuggestion) {
    setBusy(s.category);
    setError("");
    try {
      await api.setBudget({ body: { category: s.category, monthlyLimitCents: s.suggestedLimitCents } });
      setAdded((a) => [...a, s.category]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this limit.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Suggested Budgets" subtitle="Categories with no limit yet, based on your last three full months" lift={false}>
      <ul className="space-y-2">
        {rows.map((s) => {
          const name = labels[s.category] ?? s.category;
          return (
            <li key={s.category} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)" }}>
              <span className="flex min-w-0 items-center gap-3">
                <CategoryIcon id={s.category} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{name}</span>
                  <span className="text-xs text-muted">Usually about {formatUsd(s.typicalCents)} a month. Consider a limit of {formatUsd(s.suggestedLimitCents)}.</span>
                </span>
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void add(s)}
                aria-label={`Add a ${formatUsd(s.suggestedLimitCents)} limit for ${name}`}
                className={buttonClass({ variant: "quiet" })}
              >
                {busy === s.category ? "Saving…" : "Add This Limit"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{added.length ? `${added.length} limit${added.length === 1 ? "" : "s"} added.` : ""}</p>
    </Card>
  );
}
