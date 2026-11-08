"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { formatUsd, type Account, type Goal, type Transaction } from "@finvantage/contracts";

type SearchScope = "all" | "transactions" | "accounts" | "goals";
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "about", "can", "could", "did", "do", "does", "for", "from", "going", "goes", "have", "how", "i", "in", "is", "it", "last", "me", "month", "monthly", "much", "my", "of", "on", "please", "show", "tell", "the", "this", "to", "was", "what", "when", "where", "which", "with", "you", "your", "year", "top", "category", "categories",
]);

const SEMANTIC_GROUPS = [
  ["income", "pay", "paycheck", "paychecks", "salary", "salaries", "wage", "wages", "payroll", "deposit", "deposits", "earnings"],
  ["spend", "spending", "spent", "expense", "expenses", "purchase", "purchases", "buy", "bought", "payment", "payments", "outflow", "outflows"],
  ["money", "cash", "funds", "finance", "finances"],
  ["grocery", "groceries", "food", "dining", "restaurant", "restaurants", "cafe", "coffee", "supermarket"],
  ["bill", "bills", "utility", "utilities", "electric", "electricity", "water", "internet", "mortgage", "rent", "insurance"],
  ["fuel", "gas", "transport", "transportation", "car", "auto", "rideshare", "parking"],
  ["goal", "goals", "saving", "savings", "target", "targets", "plan", "plans"],
  ["account", "accounts", "bank", "banks", "checking", "savings", "credit", "card", "cards", "balance", "balances"],
  ["debt", "owed", "owe", "liability", "liabilities", "loan", "loans", "outstanding"],
  ["recurring", "repeat", "repeating", "subscription", "subscriptions", "automatic", "autopay"],
  ["trip", "travel", "vacation", "holiday", "japan"],
];

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}.$-]+/gu, " ").trim();
const words = (value: string) => normalize(value).split(/\s+/).filter((word) => word && !STOP_WORDS.has(word));

function matchesSemanticQuery(query: string, haystack: string) {
  const queryWords = words(query);
  if (queryWords.length === 0) return false;
  const text = ` ${normalize(haystack)} `;
  return queryWords.every((word) => {
    const aliases = SEMANTIC_GROUPS.filter((group) => group.includes(word)).flat();
    const choices = new Set([word, ...aliases]);
    return [...choices].some((choice) => text.includes(` ${choice} `) || text.includes(` ${choice.replaceAll(" ", " ")} `));
  });
}

function monthLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function OverviewSearch({ accounts, goals, transactions }: { accounts: Account[]; goals: Goal[]; transactions: Transaction[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!formRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const matches = useMemo(() => {
    const transactionMatches = transactions.filter((tx) => matchesSemanticQuery(query, [
      tx.merchant,
      tx.category ?? "uncategorized",
      tx.subcategory ?? "",
      tx.categoryDetailed ?? "",
      tx.date,
      monthLabel(tx.date),
      tx.currency,
      formatUsd(tx.amountCents),
      tx.isRecurring ? "recurring subscription automatic payment transaction transactions money cash" : "one time purchase transaction transactions money cash",
      tx.amountCents >= 0 ? "income paycheck salary deposit" : "expense spending outflow payment",
    ].join(" "))).slice(0, 5);
    const accountMatches = accounts.filter((account) => matchesSemanticQuery(query, [
      account.name,
      account.institution,
      account.type,
      account.subtype ?? "",
      account.mask ?? "",
      formatUsd(account.balanceCents),
      account.type === "credit_card" || account.type === "loan" || account.type === "mortgage" ? "debt owed liability outstanding" : "asset money available",
      "account bank balance",
    ].join(" "))).slice(0, 4);
    const goalMatches = goals.filter((goal) => matchesSemanticQuery(query, [
      goal.name,
      goal.targetDate,
      goal.flexibility,
      formatUsd(goal.targetCents),
      formatUsd(goal.currentCents),
      "goal savings target plan",
    ].join(" "))).slice(0, 4);

    return {
      transactions: scope === "all" || scope === "transactions" ? transactionMatches : [],
      accounts: scope === "all" || scope === "accounts" ? accountMatches : [],
      goals: scope === "all" || scope === "goals" ? goalMatches : [],
    };
  }, [accounts, goals, query, scope, transactions]);

  const hasMatches = matches.transactions.length + matches.accounts.length + matches.goals.length > 0;
  const suggestions = useMemo(() => {
    const options: Array<{ label: string; query: string }> = [];
    if (transactions.some((tx) => tx.amountCents > 0)) options.push({ label: "Income", query: "income" });
    if (transactions.some((tx) => tx.isRecurring)) options.push({ label: "Recurring payments", query: "recurring payments" });
    if (transactions.some((tx) => tx.amountCents < 0)) options.push({ label: "Spending", query: "spending" });

    const categoryCounts = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.amountCents < 0 && tx.category) categoryCounts.set(tx.category, (categoryCounts.get(tx.category) ?? 0) + 1);
    }
    for (const [category] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
      options.push({ label: category.replace(/[._]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), query: category.replace(/[._]/g, " ") });
    }
    for (const goal of goals.slice(0, 2)) options.push({ label: goal.name, query: goal.name });
    for (const account of accounts.slice(0, 2)) options.push({ label: account.name, query: account.name });
    return [...new Map(options.map((option) => [option.label.toLocaleLowerCase(), option])).values()].slice(0, 6);
  }, [accounts, goals, transactions]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;

    if (scope === "accounts" || (scope === "all" && matches.accounts.length > 0 && matches.transactions.length === 0 && matches.goals.length === 0)) {
      router.push("/accounts");
    } else if (scope === "goals" || (scope === "all" && matches.goals.length > 0 && matches.transactions.length === 0 && matches.accounts.length === 0)) {
      router.push("/goals");
    } else {
      router.push(`/transactions?search=${encodeURIComponent(query.trim())}`);
    }
    setOpen(false);
  }

  function selectSuggestion(value: string) {
    setScope("all");
    setQuery(value);
    setOpen(true);
  }

  const scopeOptions: Array<{ label: string; value: SearchScope }> = [
    { label: "All", value: "all" },
    { label: "Transactions", value: "transactions" },
    { label: "Accounts", value: "accounts" },
    { label: "Goals", value: "goals" },
  ];

  return (
    <form ref={formRef} onSubmit={submit} className="relative w-full min-w-0 sm:w-[380px]" role="search">
      <label className="sr-only" htmlFor="overview-search">Search transactions, accounts, and goals</label>
      <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8d94a8]" />
      <input
        id="overview-search"
        type="search"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        placeholder="Search transactions, accounts, goals…"
        autoComplete="off"
        aria-expanded={open}
        aria-controls="overview-search-results"
        className="w-full rounded-2xl border border-[#edf0f7] bg-white py-3 pl-11 pr-11 font-roboto text-sm text-[#16192c] placeholder:text-[#8d94a8] outline-none shadow-[0_1px_3px_rgba(22,25,44,0.03)] transition focus:border-[#544af7] focus:ring-4 focus:ring-[#544af7]/10"
      />
      {query && <button type="button" onClick={() => { setQuery(""); setOpen(true); }} aria-label="Clear search" className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#8d94a8] hover:bg-[#f1f2f8] hover:text-[#544af7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"><X size={16} aria-hidden="true" /></button>}
      {open && <div id="overview-search-results" className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[min(70vh,520px)] overflow-y-auto rounded-2xl border border-[#e6e9f2] bg-white p-2 shadow-[0_16px_48px_rgba(22,25,44,0.16)]">
        <div className="flex flex-wrap gap-1.5 px-2 pb-2" aria-label="Search categories">
          {scopeOptions.map((option) => <button key={option.value} type="button" aria-pressed={scope === option.value} onClick={() => setScope(option.value)} className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7] ${scope === option.value ? "bg-[#eceeff] text-[#544af7]" : "bg-[#f7f8fc] text-[#656d82] hover:bg-[#eef0f8]"}`}>{option.label}</button>)}
        </div>

        {!query.trim() ? <section className="border-t border-[#edf0f7] pt-2">
          <h2 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8d94a8]">Suggested Searches</h2>
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {suggestions.map((option) => <button key={option.label} type="button" onClick={() => selectSuggestion(option.query)} className="min-h-9 rounded-xl border border-[#edf0f7] bg-white px-3 text-xs font-medium text-[#424a60] hover:border-[#c9cafa] hover:bg-[#f8f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">{option.label}</button>)}
          </div>
          <p className="px-3 pb-2 text-xs text-[#8d94a8]">Try natural searches like “paycheck,” “food spending,” or “what do I owe?”</p>
        </section> : !hasMatches ? <p className="border-t border-[#edf0f7] px-3 py-4 text-sm text-[#8d94a8]">No matches in {scope === "all" ? "your accounts, goals, or transactions" : `your ${scope}`}.</p> : <div className="space-y-2 border-t border-[#edf0f7] pt-2">
          {matches.transactions.length > 0 && <section><h2 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8d94a8]">Transactions</h2>{matches.transactions.map((tx) => <Link key={tx.id} href={`/transactions?search=${encodeURIComponent(tx.merchant)}`} onClick={() => setOpen(false)} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-[#f8f9fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#16192c]">{tx.merchant}</span><span className="block truncate text-xs capitalize text-[#8d94a8]">{tx.category?.replace(/[._]/g, " ") ?? "Uncategorized"} · {tx.date}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: tx.amountCents >= 0 ? "var(--good)" : "var(--critical)" }}>{formatUsd(tx.amountCents)}</span></Link>)}</section>}
          {matches.accounts.length > 0 && <section><h2 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8d94a8]">Accounts</h2>{matches.accounts.map((account) => <Link key={account.id} href="/accounts" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 hover:bg-[#f8f9fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"><span className="block truncate text-sm font-semibold text-[#16192c]">{account.name}</span><span className="block text-xs capitalize text-[#8d94a8]">{account.institution} · {account.type.replaceAll("_", " ")} · {formatUsd(account.balanceCents)}</span></Link>)}</section>}
          {matches.goals.length > 0 && <section><h2 className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8d94a8]">Goals</h2>{matches.goals.map((goal) => <Link key={goal.id} href="/goals" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 hover:bg-[#f8f9fe] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"><span className="block truncate text-sm font-semibold text-[#16192c]">{goal.name}</span><span className="block text-xs text-[#8d94a8]">Target {formatUsd(goal.targetCents)} · {goal.targetDate}</span></Link>)}</section>}
        </div>}

        {query.trim() && <button type="submit" className="mt-2 w-full rounded-xl bg-[#f1f2f8] px-3 py-2.5 text-left text-sm font-semibold text-[#544af7] hover:bg-[#eceeff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">{scope === "accounts" ? "Open accounts" : scope === "goals" ? "Open goals" : `Search transactions for “${query.trim()}”`}</button>}
      </div>}
    </form>
  );
}
