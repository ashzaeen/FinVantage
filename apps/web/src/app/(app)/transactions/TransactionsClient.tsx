"use client";

import { useMemo, useState, useCallback, type FormEvent } from "react";
import { formatUsd, type Account, type CurrencyCode, type SpendingCategory, type Transaction } from "@finvantage/contracts";
import { api } from "@/lib/api";

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
          <label className="block text-sm font-medium text-[#4a4f68]">
            {levelLabels[i] ?? `Level ${i + 1}`}
            <select
              value={level.selected ?? ""}
              onChange={(e) => handleChange(i, e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-base text-[#16192c] outline-none transition focus:border-[#544af7] focus:bg-white"
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
        <p className="flex items-center gap-1.5 text-xs text-[#8d94a8]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          {chain.map((id) => byId.get(id)?.label ?? id).join(" → ")}
        </p>
      )}
    </div>
  );
}

function MerchantAvatar({ name }: { name: string }) {
  const colors = [["#fee2e2", "#ef4444"], ["#fef3c7", "#f59e0b"], ["#d1fae5", "#10b981"], ["#dbeafe", "#3b82f6"], ["#ede9fe", "#8b5cf6"]];
  const [bg, fg] = colors[(name.charCodeAt(0) || 0) % colors.length]!;
  return <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: bg, color: fg }}>{name.slice(0, 2).toUpperCase()}</span>;
}

function StatusBadge({ positive }: { positive: boolean }) {
  return <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: positive ? "var(--good-bg)" : "var(--critical-bg)", color: positive ? "var(--good)" : "var(--critical)" }}>{positive ? "Income" : "Expense"}</span>;
}

const CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "INR", "MXN"];
function formatCurrency(amountCents: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

export function TransactionsClient({ transactions: initialTransactions, accounts, categories: spendingCategories, initialQuery = "" }: { transactions: Transaction[]; accounts: Account[]; categories: SpendingCategory[]; initialQuery?: string }) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<"all" | "income" | "expense">("all");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editCategory, setEditCategory] = useState<string | null>(null);
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
        setTransactions((current) => [saved, ...current]);
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

  return <>
    <section className="w-full">
    <div className="flex flex-col gap-3 border-b border-[#edf0f7] px-1 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-poppins text-base font-bold text-[#16192c]">All transactions</h2><p aria-live="polite" className="mt-0.5 text-xs text-[#8d94a8]">Showing {filtered.length} of {transactions.length} loaded</p></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" disabled={!accounts.length} title={!accounts.length ? "Add an account first" : undefined} onClick={() => {
          setIsCreating(true);
          setEditing({ id: "new", accountId: accounts[0]!.id, date: new Date().toISOString().slice(0, 10), amountCents: 0, currency: "USD", originalAmountCents: null, exchangeRateToUsd: null, exchangeRateDate: null, merchant: "", category: null, subcategory: null, isRecurring: false, pending: false, categoryDetailed: null, paymentChannel: null, logoUrl: null });
          setEditCategory(null);
          setSaveError("");
        }} className="rounded-xl bg-[#544af7] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#453bc9] disabled:cursor-not-allowed disabled:opacity-45">+ Add transaction</button>
        <label className="relative min-w-0 sm:w-72">
          <span className="sr-only">Search transactions</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8d94a8]"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchant, category, date…" className="w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] py-2.5 pl-10 pr-10 text-sm text-[#16192c] outline-none transition placeholder:text-[#9ba1b2] focus:border-[#544af7] focus:bg-white focus:ring-4 focus:ring-[#544af7]/10" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg text-[#8d94a8] hover:bg-[#eceeff] hover:text-[#544af7]">×</button>}
        </label>
        <label><span className="sr-only">Filter transaction type</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="w-full rounded-xl border border-[#e6e9f2] bg-white px-3 py-2.5 text-sm text-[#4a4f68] outline-none focus:border-[#544af7] sm:w-auto"><option value="all">All types</option><option value="income">Income</option><option value="expense">Expenses</option></select></label>
        <label><span className="sr-only">Filter transaction category</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-[#e6e9f2] bg-white px-3 py-2.5 text-sm text-[#4a4f68] outline-none focus:border-[#544af7] sm:w-auto"><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      </div>
    </div>
    <div className="hidden grid-cols-[minmax(0,1fr)_150px_130px_100px] gap-4 border-b border-[#edf0f7] bg-[#fafbfe] py-3 text-xs font-semibold uppercase tracking-wide text-[#8d94a8] sm:grid"><span>Merchant</span><span>Date</span><span className="text-right">Amount</span><span className="text-right">Type</span></div>
    {filtered.length ? <ul className="divide-y divide-[#edf0f7]">{filtered.map((tx) => <li key={tx.id}>
      <button type="button" onClick={() => { setEditing(tx); setEditCategory(tx.subcategory ?? tx.category); setIsCreating(false); setSaveError(""); }} aria-label={`Edit transaction from ${tx.merchant}`} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3.5 text-left transition-colors hover:bg-[#fafbfe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#544af7] sm:grid-cols-[minmax(0,1fr)_150px_130px_100px] sm:gap-4">
      <span className="flex min-w-0 items-center gap-3"><MerchantAvatar name={tx.merchant} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#16192c]">{tx.merchant}</span><span className="block truncate text-xs text-[#8d94a8]">{label(tx.subcategory ?? tx.category)}{tx.isRecurring ? " · Recurring" : ""}</span></span></span>
      <span className="col-start-1 pl-12 text-xs text-[#8d94a8] sm:col-auto sm:pl-0">{new Date(`${tx.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      <span className="row-start-1 text-right text-sm font-semibold tabular-nums sm:row-auto" style={{ color: tx.amountCents < 0 ? "var(--critical)" : "var(--good)" }}>{formatCurrency(tx.originalAmountCents ?? tx.amountCents, tx.originalAmountCents == null ? "USD" : tx.currency)}{tx.currency !== "USD" && <span className="mt-0.5 block text-[11px] font-normal text-[#8d94a8]">{formatUsd(tx.amountCents)} equivalent</span>}</span>
      <span className="col-start-2 row-start-2 flex justify-end sm:col-auto sm:row-auto"><StatusBadge positive={tx.amountCents >= 0} /></span>
    </button></li>)}</ul> : <div className="px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1f2f8] text-[#8d94a8]"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4M8 11h6" /></svg></div><h3 className="mt-3 font-semibold text-[#16192c]">No matching transactions</h3><p className="mt-1 text-sm text-[#8d94a8]">Try another merchant, category, date, or filter.</p>{(query || type !== "all" || category !== "all") && <button type="button" onClick={() => { setQuery(""); setType("all"); setCategory("all"); }} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-[#544af7] hover:bg-[#eef1fc]">Clear filters</button>}</div>}
    </section>
    {editing && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditing(null); setIsCreating(false); } }} className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#16192c]/45 p-3 text-[#16192c] backdrop-blur-[2px] sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="transaction-edit-title" className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-[#f8f9fe] shadow-2xl sm:max-h-[90dvh]">
        <header className="sticky top-0 z-10 flex h-[70px] items-center justify-between border-b border-[#edf0f7] bg-white px-6 shadow-sm sm:px-8"><h2 id="transaction-edit-title" className="font-poppins text-xl font-semibold">{isCreating ? "Add transaction" : "Edit transaction"}</h2><button type="button" onClick={() => { setEditing(null); setIsCreating(false); }} aria-label="Close transaction editor" className="rounded-xl p-2 text-3xl leading-none text-[#8d94a8] hover:bg-[#f1f2f8] hover:text-[#16192c]">×</button></header>
        <form onSubmit={saveTransaction}>
          <div className="flex flex-col gap-5 bg-white p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f1f2f8] p-1"><label className="cursor-pointer"><input type="radio" name="type" value="expense" defaultChecked={isCreating || editing.amountCents < 0} className="peer sr-only" /><span className="block rounded-lg px-4 py-3 text-center font-semibold text-[#8d94a8] transition peer-checked:bg-white peer-checked:text-[#544af7] peer-checked:shadow-sm">Expense</span></label><label className="cursor-pointer"><input type="radio" name="type" value="income" defaultChecked={!isCreating && editing.amountCents >= 0} className="peer sr-only" /><span className="block rounded-lg px-4 py-3 text-center font-semibold text-[#8d94a8] transition peer-checked:bg-white peer-checked:text-[#0b8f69] peer-checked:shadow-sm">Income</span></label></div>
            <label className="space-y-2 text-sm font-medium text-[#4a4f68]">Amount *<div className="flex gap-3"><input name="amount" type="number" min="0" step="0.01" required defaultValue={isCreating ? "" : (Math.abs(editing.originalAmountCents ?? editing.amountCents) / 100).toFixed(2)} className="w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-lg text-[#16192c] outline-none focus:border-[#544af7] focus:bg-white"/><select name="currency" defaultValue={editing.currency} aria-label="Transaction currency" className="rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 text-[#4a4f68] outline-none focus:border-[#544af7]">{CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></div><span className="block text-xs font-normal text-[#8d94a8]">Non-USD amounts are converted to USD for your dashboard using the transaction-date exchange rate.</span></label>
            <label className="space-y-2 text-sm font-medium text-[#4a4f68]">Merchant<input name="merchant" required maxLength={120} defaultValue={editing.merchant} className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-base text-[#16192c] outline-none focus:border-[#544af7] focus:bg-white" /></label>
            <label className="space-y-2 text-sm font-medium text-[#4a4f68]">Account<select name="accountId" required defaultValue={editing.accountId} className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-base text-[#16192c] outline-none focus:border-[#544af7]">{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <CategoryPicker categories={spendingCategories} value={editCategory} onChange={setEditCategory} />
            <label className="space-y-2 text-sm font-medium text-[#4a4f68]">Date<input name="date" type="date" required defaultValue={editing.date} className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-base text-[#16192c] outline-none focus:border-[#544af7] focus:bg-white" /></label>
            <label className="flex items-center gap-3 text-sm text-[#4a4f68]"><input name="isRecurring" type="checkbox" defaultChecked={editing.isRecurring} className="h-4 w-4 accent-[#544af7]"/>Recurring transaction</label>
            {saveError && <p role="alert" className="text-sm text-[#d7465d]">{saveError}</p>}
            <button disabled={saving} type="submit" className="mt-auto rounded-2xl bg-[#544af7] px-5 py-4 font-semibold text-white transition hover:bg-[#453bc9] disabled:opacity-50">{saving ? "Saving…" : isCreating ? "Add transaction" : "Save changes"}</button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}
