"use client";

import { useState } from "react";
import { formatUsd, type SpendingCategory, type Transaction } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { CategorySelect } from "./CategorySelect";
import { buttonClass } from "@/components/ui/Button";

/** Split one purchase into two parts that add up to it. The API checks the sum; nothing is saved until Split. */
export function SplitDialog({ transaction, categories, onSplit, onClose }: {
  transaction: Transaction;
  categories: SpendingCategory[];
  onSplit: (parts: Transaction[]) => void;
  onClose: () => void;
}) {
  const total = Math.abs(transaction.amountCents);
  const sign = transaction.amountCents < 0 ? -1 : 1;
  const [firstText, setFirstText] = useState((Math.floor(total / 2) / 100).toFixed(2));
  const [catA, setCatA] = useState<string | null>(transaction.subcategory ?? transaction.category);
  const [catB, setCatB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firstCents = Math.round(Number(firstText) * 100);
  const valid = Number.isFinite(firstCents) && firstCents > 0 && firstCents < total;

  async function split() {
    setBusy(true);
    setError("");
    try {
      const parts = await api.splitTransaction({
        params: { id: transaction.id },
        body: { parts: [{ amountCents: sign * firstCents, categoryId: catA }, { amountCents: sign * (total - firstCents), categoryId: catB }] },
      });
      onSplit(parts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not split this transaction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }} className="fixed inset-0 z-[110] flex justify-center overflow-y-auto bg-ink/45 p-3 backdrop-blur-[2px] sm:p-6 [&>*]:my-auto">
      <div role="dialog" aria-modal="true" aria-labelledby="split-title" className="w-full max-w-md rounded-3xl bg-raised p-5 shadow-2xl sm:p-6">
        <h2 id="split-title" className="font-poppins text-lg font-bold text-ink">Split {transaction.merchant}</h2>
        <p className="mt-1 text-sm text-muted">{formatUsd(total)} on {transaction.date}. The two parts must add up to it, so your totals do not change.</p>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink">Part One ($)
              <input type="number" inputMode="decimal" min={0.01} step={0.01} value={firstText} onChange={(e) => setFirstText(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3 text-base tabular-nums text-ink outline-none focus:border-accent-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink" />
            </label>
            <div className="mt-2"><CategorySelect categories={categories} value={catA} onChange={setCatA} label="Part one category" /></div>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Part Two: <span className="tabular-nums">{valid ? formatUsd(total - firstCents) : "Enter part one"}</span></p>
            <div className="mt-2"><CategorySelect categories={categories} value={catB} onChange={setCatB} label="Part two category" /></div>
          </div>
        </div>
        {!valid && <p className="mt-3 text-xs text-muted">Part one must be above $0 and below {formatUsd(total)}.</p>}
        {error && <p role="alert" className="mt-3 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className={buttonClass({ variant: "quiet" })}>Cancel</button>
          <button type="button" disabled={busy || !valid} onClick={() => void split()} className={buttonClass({ variant: "primary" })}>{busy ? "Splitting…" : "Split"}</button>
        </div>
      </div>
    </div>
  );
}
