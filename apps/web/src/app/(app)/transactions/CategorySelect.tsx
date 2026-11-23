"use client";

import type { SpendingCategory } from "@finvantage/contracts";

/** A plain select of every visible category, subcategories indented under their parent. */
export function CategorySelect({ categories, value, onChange, label, allowNone = true }: {
  categories: SpendingCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
  allowNone?: boolean;
}) {
  const visible = categories.filter((c) => !c.hidden);
  const tops = visible.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => visible.filter((c) => c.parentId === id);
  const rows = tops.flatMap((t) => [{ c: t, depth: 0 }, ...childrenOf(t.id).map((c) => ({ c, depth: 1 }))]);
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent-ink"
    >
      {allowNone && <option value="">Uncategorized</option>}
      {rows.map(({ c, depth }) => <option key={c.id} value={c.id}>{depth ? "  " : ""}{c.label}</option>)}
    </select>
  );
}
