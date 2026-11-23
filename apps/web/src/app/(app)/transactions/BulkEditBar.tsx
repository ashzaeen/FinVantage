"use client";

import { useState } from "react";
import type { SpendingCategory } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { CategorySelect } from "./CategorySelect";

/** Appears while rows are selected: move them all to one category, with a clear count and a confirm press. */
export function BulkEditBar({ ids, categories, onApplied, onClear }: {
  ids: string[];
  categories: SpendingCategory[];
  onApplied: (ids: string[], categoryId: string | null) => void;
  onClear: () => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = categories.find((c) => c.id === target)?.label ?? "Uncategorized";

  async function apply() {
    setBusy(true);
    setError("");
    try {
      await api.bulkRecategorizeTransactions({ body: { ids, categoryId: target } });
      onApplied(ids, target);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move these transactions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label="Bulk edit" className="sticky bottom-3 z-10 mt-4 rounded-2xl border border-line bg-raised p-3 shadow-lg" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="flex flex-wrap items-center gap-3">
        <p aria-live="polite" className="text-sm font-semibold text-ink">{plural(ids.length, "transaction")} selected</p>
        <div className="min-w-[10rem] flex-1 sm:max-w-xs"><CategorySelect categories={categories} value={target} onChange={setTarget} label="Move selected to" /></div>
        <button type="button" disabled={busy || ids.length === 0} onClick={() => void apply()} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
          {busy ? "Moving…" : `Move to ${label}`}
        </button>
        <button type="button" disabled={busy} onClick={onClear} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted">Done</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
    </div>
  );
}
