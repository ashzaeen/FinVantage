"use client";

import { useMemo, useState, useCallback, type FormEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { assignCategory, formatUsd, type Account, type CurrencyCode, type SpendingCategory, type UnusualCharge, type Transaction } from "@finvantage/contracts";
import { ArrowDownLeft, ArrowUpRight, Check, Download, EyeOff, Plus, Repeat, Search, SearchX, Trash2, Undo2, X } from "lucide-react";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { api } from "@/lib/api";
import { TransactionSummaryBar } from "./TransactionSummaryBar";
import { BulkEditBar } from "./BulkEditBar";
import { SplitDialog } from "./SplitDialog";
import { buttonClass } from "@/components/ui/Button";

/* ─── Cascading Category Picker ──────────────────────────────────────────── */

function CategoryPicker({ categories, value, onChange }: {
  categories: SpendingCategory[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, SpendingCategory[]>();
    for (const c of categories) {
      const siblings = map.get(c.parentId) ?? [];
      siblings.push(c);
      map.set(c.parentId, siblings);
    }
    return map;
  }, [categories]);

  // Walk from the current value up to the root to find the selected chain.
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const chain = useMemo(() => {
    const ids: string[] = [];
    let cur = value;
    while (cur) {
      ids.unshift(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return ids;
  }, [value, byId]);

  // Build the cascade: level 0 = top-level, level 1 = children of chain[0], etc.
  const levels: { parentId: string | null; options: SpendingCategory[]; selected: string | null }[] = [];
  let parentId: string | null = null;
  for (let i = 0; ; i++) {
    const options = (childrenOf.get(parentId) ?? []).filter((c) => !c.hidden);
    if (!options.length) break;
    levels.push({ parentId, options, selected: chain[i] ?? null });
    if (!chain[i]) break;
    parentId = chain[i]!;
  }

  const handleChange = useCallback((level: number, id: string) => {
    if (!id) {
      // Cleared this level — use the parent as the value, or null for top level.
      onChange(level === 0 ? null : chain[level - 1] ?? null);
    } else {
      onChange(id);
    }
  }, [onChange, chain]);

  const levelLabels = ["Category", "Subcategory", "Detail"];

  return (
    <div className="space-y-3">
      {levels.map((level, i) => (
        <div key={level.parentId ?? "root"} style={{ animation: i > 0 ? "cascadeIn 200ms ease-out" : undefined }}>
          <label className="block text-sm font-medium text-ink-secondary">
            {levelLabels[i] ?? `Level ${i + 1}`}
            <select
              value={level.selected ?? ""}
              onChange={(e) => handleChange(i, e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-accent-ink focus:bg-raised focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              <option value="">{i === 0 ? "Uncategorized" : `All ${byId.get(level.parentId!)?.label ?? ""}`}</option>
              {level.options.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>
      ))}
      {value && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          {chain.map((id) => byId.get(id)?.label ?? id).join(" → ")}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ positive }: { positive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${positive ? "bg-good-bg text-gain" : "bg-critical-bg text-loss"}`}>
      {positive ? <ArrowDownLeft size={12} aria-hidden /> : <ArrowUpRight size={12} aria-hidden />}
      {positive ? "Income" : "Expense"}
    </span>
  );
}

/**
 * A spreadsheet can run a cell that starts with one of these as a formula. Merchant names come from
 * outside, so a leading quote makes them text.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The rows as shown, as a file. Amounts are plain decimals so a spreadsheet can add them. */
function downloadCsv(rows: Transaction[], accountName: (id: string) => string, categoryLabel: (id: string | null) => string) {
  const lines = [
    ["Date", "Merchant", "Category", "Account", "Amount", "Currency", "Recurring"].join(","),
    ...rows.map((tx) => [tx.date, csvCell(tx.merchant), csvCell(categoryLabel(tx.subcategory ?? tx.category)), csvCell(accountName(tx.accountId)), (tx.amountCents / 100).toFixed(2), "USD", tx.isRecurring ? "yes" : "no"].join(",")),
  ];
  const url = URL.createObjectURL(new Blob([`${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Rows shown before "Show More". */
const PAGE_SIZE = 30;

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR", "MXN"];
function formatCurrency(amountCents: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

export function TransactionsClient({ transactions: initialTransactions, accounts, categories: spendingCategories, initialQuery = "", unusual = {} }: { unusual?: Record<string, UnusualCharge>; transactions: Transaction[]; accounts: Account[]; categories: SpendingCategory[]; initialQuery?: string }) {
  const router = useRouter();
  const [transactions, setTransactions] = useState(() => initialTransactions.filter((t) => !t.hidden));
  // Bank transactions the user hid: out of the list and every total, kept until restored.
  const [hiddenRows, setHiddenRows] = useState(() => initialTransactions.filter((t) => t.hidden));
  const [view, setView] = useState<"all" | "hidden">("all");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<"all" | "income" | "expense">("all");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState<Transaction | null>(null);
  const toggleSelected = (id: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const labelMap = useMemo(() => new Map(spendingCategories.map((c) => [c.id, c.label])), [spendingCategories]);
  const label = (id: string | null) => (id ? (labelMap.get(id) ?? id) : "Uncategorized");
  const categories = useMemo(() => [...new Set(transactions.map((tx) => tx.category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [transactions]);
  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return transactions.filter((tx) => {
      if (type === "income" && tx.amountCents < 0) return false;
      if (type === "expense" && tx.amountCents >= 0) return false;
      if (category !== "all" && tx.category !== category) return false;
      const searchable = [tx.merchant, tx.category ?? "uncategorized", tx.date, tx.amountCents.toString(), formatUsd(tx.amountCents), tx.originalAmountCents == null ? "" : formatCurrency(tx.originalAmountCents, tx.currency), tx.currency, tx.isRecurring ? "recurring" : "", tx.amountCents >= 0 ? "income" : "expense"].join(" ").toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }, [transactions, query, type, category]);

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    if (!Number.isFinite(amount) || amount < 0) { setSaveError("Enter a valid amount."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const body = {
        merchant: String(form.get("merchant")).trim(),
        accountId: String(form.get("accountId")),
        date: String(form.get("date")),
        amountCents: Math.round(amount * 100) * (form.get("type") === "expense" ? -1 : 1),
        currency: String(form.get("currency")) as CurrencyCode,
        category: editCategory,
        isRecurring: form.get("isRecurring") === "on",
      };
      if (isCreating) {
        const saved = await api.addTransaction({ body });
        // In date order, so a transaction dated before the newest one doesn't split a month into two groups.
        setTransactions((current) => [saved, ...current].sort((a, b) => b.date.localeCompare(a.date)));
      } else {
        const saved = await api.updateTransaction({ params: { id: editing.id }, body });
        setTransactions((current) => current.map((transaction) => transaction.id === saved.id ? saved : transaction));
      }
      setEditing(null);
      setIsCreating(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this transaction.");
    } finally { setSaving(false); }
  }

  // One you entered by hand is deleted. One from the bank is hidden instead, so it can come back.
  async function removeEditing() {
    if (!editing || removing) return;
    setRemoving(true);
    setSaveError("");
    try {
      const { result } = await api.removeTransaction({ params: { id: editing.id } });
      const removed = editing;
      setTransactions((current) => current.filter((t) => t.id !== removed.id));
      if (result === "hidden") setHiddenRows((current) => [{ ...removed, hidden: true }, ...current]);
      setEditing(null);
      setConfirmRemove(false);
      router.refresh(); // The cards beside the list are computed on the server and leave out hidden rows.
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not remove this transaction.");
    } finally { setRemoving(false); }
  }

  async function restoreHidden(tx: Transaction) {
    setRestoreError("");
    try {
      const restored = await api.restoreTransaction({ params: { id: tx.id } });
      setHiddenRows((current) => current.filter((t) => t.id !== tx.id));
      setTransactions((current) => [restored, ...current].sort((a, b) => b.date.localeCompare(a.date)));
      router.refresh();
    } catch {
      setRestoreError("That transaction couldn't be restored. Try again.");
    }
  }

  const [shown, setShown] = useState(PAGE_SIZE);
  // A new search or filter starts from the top of the list again.
  const filterKey = `${query}|${type}|${category}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setShown(PAGE_SIZE);
  }
  const visible = filtered.slice(0, shown);
  const groups = useMemo(() => {
    const out: Array<{ month: string; items: Transaction[] }> = [];
    for (const tx of visible) {
      const month = tx.date.slice(0, 7);
      const last = out.at(-1);
      if (last && last.month === month) last.items.push(tx);
      else out.push({ month, items: [tx] });
    }
    return out;
  }, [visible]);
  const hasFilters = Boolean(query) || type !== "all" || category !== "all";

  function startCreate() {
    setIsCreating(true);
    setEditing({ id: "new", accountId: accounts[0]!.id, date: new Date().toISOString().slice(0, 10), amountCents: 0, currency: "USD", originalAmountCents: null, exchangeRateToUsd: null, exchangeRateDate: null, merchant: "", category: null, subcategory: null, isRecurring: false, pending: false, categoryDetailed: null, paymentChannel: null, logoUrl: null });
    setEditCategory(null);
    setSaveError("");
  }

  let row = 0;

  return <>
    <section className="page-cascade-single overflow-hidden rounded-3xl border border-line bg-card shadow-[0_2px_12px_0_rgba(22,25,44,0.03)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 className="font-poppins text-base font-bold text-ink">{view === "hidden" ? "Hidden Transactions" : "All Transactions"}</h2>
          <p aria-live="polite" className="mt-0.5 text-xs text-muted">
            {view === "hidden"
              ? `${hiddenRows.length} hidden`
              : hasFilters ? `${filtered.length} of ${transactions.length} match` : `${transactions.length} transactions`}
          </p>
          <div className="mt-2 inline-flex rounded-xl bg-inset p-1" role="group" aria-label="Transaction view">
            {([["all", "All", transactions.length], ["hidden", "Hidden", hiddenRows.length]] as const).map(([value, name, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => { setView(value); setRestoreError(""); }}
                className={`min-h-9 rounded-lg px-3 py-1.5 text-sm font-medium transition max-lg:min-h-11 ${view === value ? "bg-card text-accent-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {name} <span className="text-xs tabular-nums text-muted">{count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={selectMode}
          onClick={() => { setSelectMode((on) => !on); setSelected(new Set()); }}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${selectMode ? "border-accent-ink bg-accent-soft text-accent-ink" : "border-line bg-card text-ink hover:border-accent-ink hover:text-accent-ink"}`}
        >
          <Check size={16} aria-hidden /> {selectMode ? "Selecting" : "Select"}
        </button>
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => downloadCsv(filtered, (id) => accounts.find((a) => a.id === id)?.name ?? "", label)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink transition hover:border-accent-ink hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-0"
        >
          <Download size={16} aria-hidden /> Export CSV
        </button>
        <button
          type="button"
          disabled={!accounts.length}
          title={!accounts.length ? "Add an account first" : undefined}
          onClick={startCreate}
          className={buttonClass()}
        >
          <Plus size={16} aria-hidden /> Add Transaction
        </button>
        </div>
      </div>

      {view === "hidden" ? (
        <div className="px-5 pb-5 pt-4 sm:px-6">
          <p className="text-sm text-muted">Hidden transactions are left out of your totals and charts. They stay on file, and restoring one brings it back.</p>
          {restoreError && <p role="alert" className="mt-3 text-sm text-loss">{restoreError}</p>}
          {hiddenRows.length ? (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {hiddenRows.map((tx) => (
                <li key={tx.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{tx.merchant}</span>
                    <span className="block truncate text-xs text-muted">
                      {new Date(`${tx.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {label(tx.subcategory ?? tx.category)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`text-sm font-semibold tabular-nums ${tx.amountCents >= 0 ? "text-gain" : "text-loss"}`}>
                      {tx.amountCents >= 0 ? "+" : "−"}{formatUsd(Math.abs(tx.amountCents))}
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreHidden(tx)}
                      aria-label={`Restore transaction from ${tx.merchant}`}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-ink transition hover:border-accent-ink hover:text-accent-ink lg:min-h-9"
                    >
                      <Undo2 size={14} aria-hidden /> Restore
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-2 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-inset text-muted"><EyeOff size={22} aria-hidden /></div>
              <h3 className="mt-3 font-poppins font-semibold text-ink">Nothing Hidden</h3>
              <p className="mt-1 text-sm text-muted">Open a bank transaction and choose Hide Transaction, and it waits here until you restore it.</p>
            </div>
          )}
        </div>
      ) : <>
      <div className="flex flex-col gap-2 px-5 pb-4 pt-4 sm:px-6 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search Transactions</span>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search merchant, category, date, or amount…"
            className="w-full rounded-xl border border-line bg-inset py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition placeholder:text-muted focus:border-accent-ink focus:bg-card focus:ring-4 focus:ring-accent-ink/10"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent-ink">
              <X size={15} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-inset p-1" role="group" aria-label="Filter by type">
            {(["all", "income", "expense"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${type === value ? "bg-card text-accent-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {value === "all" ? "All" : value === "income" ? "Income" : "Expenses"}
              </button>
            ))}
          </div>
          <label>
            <span className="sr-only">Filter by category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              <option value="all">All Categories</option>
              {categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}
            </select>
          </label>
        </div>
      </div>

      <TransactionSummaryBar ids={filtered.map((tx) => tx.id)} filtered={hasFilters} />

      <div className="hidden grid-cols-[minmax(0,1fr)_140px_130px_96px] gap-4 border-y border-line bg-surface px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
        <span>Merchant</span><span>Date</span><span className="text-right">Amount</span><span className="text-right">Type</span>
      </div>

      {filtered.length ? (
        <div className="px-2 pb-3 sm:px-3">
          {groups.map((group) => (
            <div key={group.month}>
              <p className="sticky top-0 z-[1] bg-card/95 px-3 pb-1.5 pt-4 text-xs font-semibold text-muted backdrop-blur sm:px-4">{monthLabel(group.month)}</p>
              <ul className="space-y-0.5">
                {group.items.map((tx) => {
                  const income = tx.amountCents >= 0;
                  const i = row++;
                  return (
                    <li key={tx.id} className={`row-cascade ${selectMode && selected.has(tx.id) ? "rounded-xl bg-accent-soft" : ""}`} style={{ "--i": i } as CSSProperties}>
                      <button
                        type="button"
                        onClick={() => { if (selectMode) { toggleSelected(tx.id); return; } setEditing(tx); setEditCategory(tx.subcategory ?? tx.category); setIsCreating(false); setSaveError(""); setConfirmRemove(false); }}
                        aria-pressed={selectMode ? selected.has(tx.id) : undefined}
                        aria-label={selectMode ? `${selected.has(tx.id) ? "Deselect" : "Select"} transaction from ${tx.merchant}` : `Edit transaction from ${tx.merchant}`}
                        className="tile-lift grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-3 text-left hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ink sm:grid-cols-[minmax(0,1fr)_140px_130px_96px] sm:gap-4 sm:px-4"
                      >
                        <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-3 sm:col-auto sm:row-auto">
                          <CategoryIcon id={income ? "income" : (tx.subcategory ?? tx.category)} size={17} colored />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">{tx.merchant}</span>
                            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                              <span className="truncate">{label(tx.subcategory ?? tx.category)}</span>
                              {tx.isRecurring && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px text-xs font-medium text-accent-ink">
                                  <Repeat size={10} aria-hidden /> Recurring
                                </span>
                              )}
                              {tx.pending && <span className="shrink-0 rounded-full bg-warning-bg px-1.5 py-px text-xs font-medium text-warning-text">Pending</span>}
                              {unusual[tx.id] && (
                                <span className="shrink-0 rounded-full px-1.5 py-px text-xs font-medium text-ink-secondary" style={{ border: "1px solid var(--warning)" }}>
                                  {unusual[tx.id]!.ratio.toFixed(1)}x usual here <span className="font-normal text-muted">(usual {formatUsd(unusual[tx.id]!.usualCents)})</span>
                                </span>
                              )}
                            </span>
                          </span>
                        </span>
                        <span className="col-start-1 row-start-2 pl-[46px] text-xs text-muted sm:col-auto sm:row-auto sm:pl-0 sm:text-sm">
                          {new Date(`${tx.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span className={`col-start-2 row-start-1 text-right text-sm font-semibold tabular-nums sm:col-auto sm:row-auto ${income ? "text-gain" : "text-loss"}`}>
                          {income ? "+" : "−"}{formatCurrency(Math.abs(tx.originalAmountCents ?? tx.amountCents), tx.originalAmountCents == null ? "USD" : tx.currency)}
                          {tx.currency !== "USD" && <span className="mt-0.5 block text-xs font-normal text-muted">{formatUsd(tx.amountCents)} equivalent</span>}
                        </span>
                        <span className="col-start-2 row-start-2 flex justify-end sm:col-auto sm:row-auto"><StatusBadge positive={income} /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {filtered.length > shown && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink transition hover:bg-inset"
              >
                Show More <span className="text-muted">({filtered.length - shown} Left)</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-inset text-muted"><SearchX size={22} aria-hidden /></div>
          <h3 className="mt-3 font-poppins font-semibold text-ink">{transactions.length ? "No Matching Transactions" : "No Transactions Yet"}</h3>
          <p className="mt-1 text-sm text-muted">{transactions.length ? "Try another merchant, category, date, or filter." : "Add one, or link a bank on the Accounts tab."}</p>
          {hasFilters && (
            <button type="button" onClick={() => { setQuery(""); setType("all"); setCategory("all"); }} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft">
              Clear Filters
            </button>
          )}
        </div>
      )}
      </>}
    </section>
    {selectMode && selected.size > 0 && (
      <BulkEditBar
        ids={[...selected]}
        categories={spendingCategories}
        onClear={() => { setSelected(new Set()); setSelectMode(false); }}
        onApplied={(ids, categoryId) => {
          const idSet = new Set(ids);
          setTransactions((rows) => rows.map((t) => (idSet.has(t.id) ? { ...t, ...assignCategory(categoryId) } : t)));
          setSelected(new Set());
        }}
      />
    )}
    {splitting && (
      <SplitDialog
        transaction={splitting}
        categories={spendingCategories}
        onClose={() => setSplitting(null)}
        onSplit={(parts) => {
          setTransactions((rows) => [...parts.slice(1), ...rows.map((t) => parts.find((p) => p.id === t.id) ?? t)]);
          setSplitting(null);
        }}
      />
    )}
    {editing && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditing(null); setIsCreating(false); } }} className="fixed inset-0 z-[100] flex justify-center overflow-y-auto bg-ink/45 [&>*]:my-auto p-3 text-ink backdrop-blur-[2px] sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="transaction-edit-title" className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface shadow-2xl sm:max-h-[90dvh]">
        <header className="sticky top-0 z-10 flex h-[70px] items-center justify-between border-b border-line bg-raised px-6 shadow-sm sm:px-8"><h2 id="transaction-edit-title" className="font-poppins text-xl font-semibold">{isCreating ? "Add Transaction" : "Edit Transaction"}</h2><button type="button" onClick={() => { setEditing(null); setIsCreating(false); }} aria-label="Close transaction editor" className="rounded-xl p-2 text-3xl leading-none text-muted hover:bg-inset hover:text-ink">×</button></header>
        <form onSubmit={saveTransaction}>
          <div className="flex flex-col gap-5 bg-raised p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-inset p-1"><label className="cursor-pointer"><input type="radio" name="type" value="expense" defaultChecked={isCreating || editing.amountCents < 0} className="peer sr-only" /><span className="block rounded-lg px-4 py-3 text-center font-semibold text-muted transition peer-checked:bg-raised peer-checked:text-accent-ink peer-checked:shadow-sm">Expense</span></label><label className="cursor-pointer"><input type="radio" name="type" value="income" defaultChecked={!isCreating && editing.amountCents >= 0} className="peer sr-only" /><span className="block rounded-lg px-4 py-3 text-center font-semibold text-muted transition peer-checked:bg-raised peer-checked:text-gain peer-checked:shadow-sm">Income</span></label></div>
            <label className="space-y-2 text-sm font-medium text-ink-secondary">Amount *<div className="flex gap-3"><input name="amount" type="number" min="0" step="0.01" required defaultValue={isCreating ? "" : (Math.abs(editing.originalAmountCents ?? editing.amountCents) / 100).toFixed(2)} className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-lg text-ink outline-none focus:border-accent-ink focus:bg-raised focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"/><select name="currency" defaultValue={editing.currency} aria-label="Transaction currency" className="rounded-xl border border-line bg-surface px-3 text-ink-secondary outline-none focus:border-accent-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></div><span className="block text-xs font-normal text-muted">Non-USD amounts are converted to USD for your dashboard using the transaction-date exchange rate.</span></label>
            <label className="space-y-2 text-sm font-medium text-ink-secondary">Merchant<input name="merchant" required maxLength={120} defaultValue={editing.merchant} className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent-ink focus:bg-raised focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink" /></label>
            <label className="space-y-2 text-sm font-medium text-ink-secondary">Account<select name="accountId" required defaultValue={editing.accountId} className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <CategoryPicker categories={spendingCategories} value={editCategory} onChange={setEditCategory} />
            <label className="space-y-2 text-sm font-medium text-ink-secondary">Date<input name="date" type="date" required defaultValue={editing.date} className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent-ink focus:bg-raised focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink" /></label>
            <label className="flex items-center gap-3 text-sm text-ink-secondary"><input name="isRecurring" type="checkbox" defaultChecked={editing.isRecurring} className="h-4 w-4 accent-accent"/>Recurring Transaction</label>
            {saveError && <p role="alert" className="text-sm text-loss">{saveError}</p>}
            <button disabled={saving} type="submit" className={buttonClass({ size: "lg" }, "mt-auto")}>{saving ? "Saving…" : isCreating ? "Add Transaction" : "Save Changes"}</button>
            {!isCreating && editing.currency === "USD" && Math.abs(editing.amountCents) >= 2 && (
              <button type="button" disabled={saving} onClick={() => { setSplitting(editing); setEditing(null); }} className="min-h-11 rounded-xl border border-line bg-raised text-sm font-semibold text-ink-secondary">Split This Purchase</button>
            )}
            {!isCreating && (confirmRemove ? (
              <div role="group" aria-label="Confirm removing this transaction" className="rounded-xl border border-line bg-inset p-4">
                <p className="text-sm text-ink">
                  {editing.manual
                    ? "Delete this transaction? It was added by you, so it is removed for good."
                    : "Hide this transaction? It comes from your bank, so it stays on file but leaves your totals. Restore it any time from the Hidden tab."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={removing} onClick={removeEditing} className="min-h-11 rounded-xl border border-critical bg-critical-bg px-4 text-sm font-bold text-loss disabled:opacity-60">
                    {removing ? "Working…" : editing.manual ? "Yes, Delete" : "Yes, Hide"}
                  </button>
                  <button type="button" disabled={removing} onClick={() => setConfirmRemove(false)} className="min-h-11 rounded-xl border border-line bg-raised px-4 text-sm font-semibold text-ink-secondary">Keep It</button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={saving} onClick={() => setConfirmRemove(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-raised text-sm font-semibold text-loss hover:bg-critical-bg">
                {editing.manual ? <><Trash2 size={15} aria-hidden /> Delete Transaction</> : <><EyeOff size={15} aria-hidden /> Hide Transaction</>}
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>}
  </>;
}
