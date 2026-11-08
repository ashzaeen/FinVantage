"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ACCOUNT_CATEGORY,
  ACCOUNT_CATEGORY_LABEL,
  AccountType,
  formatPercent,
  formatUsd,
  isLiability,
  type Account,
  type AccountType as AccountTypeValue,
  type NetWorth,
  type NewAccount,
  type Transaction,
} from "@finvantage/contracts";
import { api } from "@/lib/api";
import { AccountsCharts } from "./AccountsCharts";

const ACCOUNT_TYPE_LABEL: Record<AccountTypeValue, string> = {
  checking: "Checking",
  savings: "Savings",
  cd: "Certificate of deposit",
  ira: "IRA",
  brokerage: "Brokerage",
  loan: "Loan",
  credit_card: "Credit card",
  mortgage: "Mortgage",
};

const INSTITUTION_DOMAINS: Array<[string, string]> = [
  ["wells fargo", "wellsfargo.com"], ["chase", "chase.com"], ["jpmorgan", "jpmorganchase.com"],
  ["bank of america", "bankofamerica.com"], ["capital one", "capitalone.com"], ["citi", "citi.com"],
  ["citibank", "citi.com"], ["discover", "discover.com"], ["american express", "americanexpress.com"],
  ["amex", "americanexpress.com"], ["us bank", "usbank.com"], ["pnc", "pnc.com"], ["td bank", "td.com"],
  ["fidelity", "fidelity.com"], ["vanguard", "vanguard.com"], ["schwab", "schwab.com"],
  ["charles schwab", "schwab.com"], ["robinhood", "robinhood.com"], ["ally", "ally.com"],
];

function institutionDomain(institution: string) {
  const normalized = institution.toLocaleLowerCase();
  return INSTITUTION_DOMAINS.find(([name]) => normalized.includes(name))?.[1] ?? null;
}

function InstitutionLogo({ institution }: { institution: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const domain = institutionDomain(institution);
  const initials = institution.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FI";
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#edf0f7] bg-white text-sm font-bold text-[#544af7]">
    {domain && !imageFailed
      ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`} alt={`${institution} logo`} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="h-8 w-8 object-contain" />
      : <span aria-label={`${institution} initials`}>{initials}</span>}
  </span>;
}

function AccountCard({ account, onOpen }: { account: Account; onOpen: () => void }) {
  const liability = isLiability(account.type);
  const typeLabel = account.type === "loan" && account.loanKind ? `${account.loanKind === "auto" ? "Auto" : "Personal"} loan` : ACCOUNT_TYPE_LABEL[account.type];
  return <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-[#edf0f7] bg-white p-4 text-left shadow-[0_2px_12px_rgba(22,25,44,0.03)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(84,74,247,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]">
    <InstitutionLogo key={account.institution} institution={account.institution} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-[#16192c]">{account.name}</span>
      <span className="mt-0.5 block truncate text-xs text-[#8d94a8]">{account.institution} · {typeLabel}</span>
    </span>
    <span className={`shrink-0 text-sm font-bold tabular-nums ${liability ? "text-[#d7465d]" : "text-[#0b8f69]"}`}>{liability ? "−" : "+"}{formatUsd(account.balanceCents)}</span>
  </button>;
}

function AccountSummary({ label, value, tone }: { label: string; value: string; tone?: "good" | "critical" }) {
  const color = tone === "good" ? "#0b8f69" : tone === "critical" ? "#d7465d" : "#16192c";
  return <div className="rounded-2xl border border-[#edf0f7] bg-white p-5 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
    <p className="text-xs font-semibold uppercase tracking-wide text-[#8d94a8]">{label}</p>
    <p className="mt-2 font-poppins text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
  </div>;
}

export function AccountsClient({ accounts, netWorth, transactions }: { accounts: Account[]; netWorth: NetWorth; transactions: Transaction[] }) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [showDirectory, setShowDirectory] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [accountType, setAccountType] = useState<AccountTypeValue>("checking");
  const [loanKind, setLoanKind] = useState<"auto" | "personal">("auto");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openAddForm() {
    setSelectedAccount(null);
    setAccountType("checking");
    setLoanKind("auto");
    setError("");
    setShowForm(true);
  }

  function openEditForm() {
    if (!selectedAccount) return;
    setAccountType(selectedAccount.type);
    setLoanKind(selectedAccount.loanKind ?? "auto");
    setError("");
    setShowForm(true);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const balance = Number(form.get("balance"));
    const rateString = String(form.get("annualRate")).trim();
    const minimumString = String(form.get("minimumPayment")).trim();
    const annualRate = rateString === "" ? null : Number(rateString) / 100;
    const minimumPayment = minimumString === "" ? null : Number(minimumString);
    if (!Number.isFinite(balance) || balance < 0 || (annualRate !== null && (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 1)) || (minimumPayment !== null && (!Number.isFinite(minimumPayment) || minimumPayment < 0))) {
      setError("Enter a valid balance, rate, and minimum payment.");
      return;
    }
    const body: NewAccount = {
      type: accountType,
      loanKind: accountType === "loan" ? loanKind : null,
      name: String(form.get("name")).trim(),
      institution: String(form.get("institution")).trim(),
      balanceCents: Math.round(balance * 100),
      annualRate,
      minimumPaymentCents: minimumPayment === null ? null : Math.round(minimumPayment * 100),
      promoRateEndsOn: String(form.get("promoRateEndsOn")) || null,
      // Preserve provider metadata when editing a linked account; manual accounts keep nulls.
      subtype: selectedAccount?.subtype ?? null,
      mask: selectedAccount?.mask ?? null,
      availableBalanceCents: selectedAccount?.availableBalanceCents ?? null,
      creditLimitCents: selectedAccount?.creditLimitCents ?? null,
      nextPaymentDueOn: selectedAccount?.nextPaymentDueOn ?? null,
    };
    setSaving(true);
    setError("");
    try {
      if (selectedAccount) await api.updateAccount({ params: { id: selectedAccount.id }, body });
      else await api.createAccount({ body });
      setShowForm(false);
      setSelectedAccount(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this account.");
    } finally {
      setSaving(false);
    }
  }

  const assets = accounts.filter((account) => !isLiability(account.type));
  const liabilities = accounts.filter((account) => isLiability(account.type));
  const recentTransactions = selectedAccount
    ? transactions.filter((transaction) => transaction.accountId === selectedAccount.id).slice(0, 6)
    : [];

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="font-poppins text-xl font-bold text-[#16192c]">Your financial accounts</h2><p className="mt-1 text-sm text-[#8d94a8]">Balances and account details in one place.</p></div>
      <button type="button" onClick={openAddForm} className="rounded-xl bg-[#544af7] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#453bc9]">+ Add account</button>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <AccountSummary label="Net worth" value={formatUsd(netWorth.netWorthCents)} />
      <AccountSummary label="Total assets" value={formatUsd(netWorth.assetsCents)} tone="good" />
      <AccountSummary label="Total liabilities" value={formatUsd(netWorth.liabilitiesCents)} tone="critical" />
    </div>

    <AccountsCharts netWorth={netWorth} />

    <section className="overflow-hidden rounded-3xl border border-[#edf0f7] bg-white shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div><h3 className="font-poppins text-base font-bold text-[#16192c]">All bank accounts</h3><p className="mt-1 text-xs text-[#8d94a8]">{accounts.length} accounts across {new Set(accounts.map((account) => account.institution)).size} institutions</p></div>
        <button type="button" aria-expanded={showDirectory} onClick={() => setShowDirectory((open) => !open)} className="self-start rounded-lg px-3 py-2 text-sm font-semibold text-[#544af7] hover:bg-[#eef1fc] sm:self-auto">{showDirectory ? "Hide directory" : "View directory"}</button>
      </div>
      {showDirectory && <div className="overflow-x-auto border-t border-[#edf0f7]">
        <table className="w-full min-w-[680px] text-left">
          <thead className="bg-[#fafbfe] text-xs uppercase tracking-wide text-[#8d94a8]"><tr><th scope="col" className="px-5 py-3 font-semibold">Financial institution</th><th scope="col" className="px-5 py-3 font-semibold">Account name</th><th scope="col" className="px-5 py-3 font-semibold">Account type</th><th scope="col" className="px-5 py-3 text-right font-semibold">Balance</th></tr></thead>
          <tbody className="divide-y divide-[#edf0f7]">{accounts.map((account) => <tr key={account.id} className="transition-colors hover:bg-[#fafbfe]">
            <td className="px-5 py-3"><span className="flex items-center gap-2.5"><InstitutionLogo key={account.institution} institution={account.institution} /><span className="whitespace-nowrap text-sm text-[#4a4f68]">{account.institution}</span></span></td>
            <td className="px-5 py-3"><button type="button" onClick={() => { setError(""); setShowForm(false); setSelectedAccount(account); }} className="whitespace-nowrap text-left text-sm font-semibold text-[#544af7] hover:underline">{account.name}</button></td>
            <td className="px-5 py-3 text-sm text-[#4a4f68]">{account.type === "loan" && account.loanKind ? `${account.loanKind === "auto" ? "Auto" : "Personal"} loan` : ACCOUNT_TYPE_LABEL[account.type]}</td>
            <td className={`px-5 py-3 text-right text-sm font-semibold tabular-nums ${isLiability(account.type) ? "text-[#d7465d]" : "text-[#0b8f69]"}`}>{isLiability(account.type) ? "−" : "+"}{formatUsd(account.balanceCents)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <div className="grid xl:grid-cols-2">
      <section className="pb-6 xl:border-r xl:border-[#edf0f7] xl:pb-0 xl:pr-6">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-poppins text-base font-bold text-[#16192c]">Assets</h3><span className="text-sm font-semibold tabular-nums text-[#0b8f69]">{formatUsd(netWorth.assetsCents)}</span></div>
        <div className="space-y-3">{assets.map((account) => <AccountCard key={account.id} account={account} onOpen={() => { setError(""); setShowForm(false); setSelectedAccount(account); }} />)}</div>
        {!assets.length && <p className="rounded-2xl border border-dashed border-[#d9ddec] p-6 text-center text-sm text-[#8d94a8]">No asset accounts yet. Add checking, savings, CDs, or investments.</p>}
      </section>
      <section className="border-t border-[#edf0f7] pt-6 xl:border-t-0 xl:pt-0 xl:pl-6">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-poppins text-base font-bold text-[#16192c]">Liabilities</h3><span className="text-sm font-semibold tabular-nums text-[#d7465d]">{formatUsd(netWorth.liabilitiesCents)}</span></div>
        <div className="space-y-3">{liabilities.map((account) => <AccountCard key={account.id} account={account} onOpen={() => { setError(""); setShowForm(false); setSelectedAccount(account); }} />)}</div>
        {!liabilities.length && <p className="rounded-2xl border border-dashed border-[#d9ddec] p-6 text-center text-sm text-[#8d94a8]">No loan or credit accounts yet.</p>}
      </section>
    </div>

    {selectedAccount && !showForm && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAccount(null); }} className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#16192c]/45 p-3 backdrop-blur-[2px] sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="account-details-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b bg-white px-6 py-5" style={{ borderColor: "var(--border)" }}>
          <InstitutionLogo key={selectedAccount.institution} institution={selectedAccount.institution} />
          <div className="min-w-0 flex-1"><p className="truncate text-xs text-[#8d94a8]">{selectedAccount.institution} · {ACCOUNT_CATEGORY_LABEL[ACCOUNT_CATEGORY[selectedAccount.type]]}</p><h2 id="account-details-title" className="truncate font-poppins text-lg font-semibold text-[#16192c]">{selectedAccount.name}</h2></div>
          <button type="button" onClick={() => setSelectedAccount(null)} aria-label="Close account details" className="rounded-lg px-2 text-2xl leading-none text-[#8d94a8]">×</button>
        </header>
        <div className="space-y-6 p-6">
          <div className="rounded-2xl bg-[#f8f9fe] p-5"><p className="text-xs font-semibold uppercase tracking-wide text-[#8d94a8]">{isLiability(selectedAccount.type) ? "Amount owed" : "Current balance"}</p><p className={`mt-2 font-poppins text-3xl font-bold tabular-nums ${isLiability(selectedAccount.type) ? "text-[#d7465d]" : "text-[#0b8f69]"}`}>{formatUsd(selectedAccount.balanceCents)}</p></div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#edf0f7] p-4"><dt className="text-xs text-[#8d94a8]">Account type</dt><dd className="mt-1 text-sm font-semibold text-[#16192c]">{selectedAccount.type === "loan" && selectedAccount.loanKind ? `${selectedAccount.loanKind === "auto" ? "Auto" : "Personal"} loan` : ACCOUNT_TYPE_LABEL[selectedAccount.type]}</dd></div>
            <div className="rounded-xl border border-[#edf0f7] p-4"><dt className="text-xs text-[#8d94a8]">Interest rate / APR</dt><dd className="mt-1 text-sm font-semibold text-[#16192c]">{selectedAccount.annualRate === null ? "Not provided" : formatPercent(selectedAccount.annualRate)}</dd></div>
            <div className="rounded-xl border border-[#edf0f7] p-4"><dt className="text-xs text-[#8d94a8]">Minimum payment</dt><dd className="mt-1 text-sm font-semibold text-[#16192c]">{selectedAccount.minimumPaymentCents === null ? "Not provided" : formatUsd(selectedAccount.minimumPaymentCents)}</dd></div>
            {selectedAccount.promoRateEndsOn && <div className="rounded-xl border border-[#edf0f7] p-4"><dt className="text-xs text-[#8d94a8]">Promotional rate ends</dt><dd className="mt-1 text-sm font-semibold text-[#16192c]">{selectedAccount.promoRateEndsOn}</dd></div>}
          </dl>
          <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-[#16192c]">Recent transactions</h3><span className="text-xs text-[#8d94a8]">Latest {recentTransactions.length}</span></div>
            {recentTransactions.length ? <ul className="divide-y divide-[#edf0f7]">{recentTransactions.map((transaction) => <li key={transaction.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-[#16192c]">{transaction.merchant}</p><p className="mt-0.5 text-xs text-[#8d94a8]">{transaction.date}{transaction.category ? ` · ${transaction.category}` : ""}</p></div><span className={`shrink-0 text-sm font-semibold tabular-nums ${transaction.amountCents < 0 ? "text-[#d7465d]" : "text-[#0b8f69]"}`}>{formatUsd(transaction.amountCents)}</span></li>)}</ul> : <p className="rounded-xl bg-[#f8f9fe] p-4 text-sm text-[#8d94a8]">No transactions have been recorded for this account yet.</p>}
          </section>
          <div className="flex justify-end"><button type="button" onClick={openEditForm} className="rounded-xl bg-[#544af7] px-5 py-3 text-sm font-semibold text-white hover:bg-[#453bc9]">Edit account</button></div>
        </div>
      </div>
    </div>}

    {showForm && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setShowForm(false); setSelectedAccount(null); } }} className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-[#16192c]/45 p-3 backdrop-blur-[2px] sm:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="account-form-title" className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5" style={{ borderColor: "var(--border)" }}><div><p className="text-xs font-semibold uppercase tracking-wide text-[#544af7]">Account management</p><h2 id="account-form-title" className="mt-1 font-poppins text-lg font-semibold text-[#16192c]">{selectedAccount ? "Edit account" : "Add account"}</h2></div><button type="button" onClick={() => { setShowForm(false); setSelectedAccount(null); }} disabled={saving} aria-label="Close account form" className="px-2 text-2xl text-[#8d94a8] disabled:opacity-50">×</button></header>
        <form onSubmit={saveAccount} className="space-y-4 p-6">
          <label className="block text-sm font-medium text-[#4a4f68]">Account name *<input name="name" required maxLength={80} defaultValue={selectedAccount?.name ?? ""} placeholder="Everyday checking" className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-[#16192c] outline-none focus:border-[#544af7]" /></label>
          <label className="block text-sm font-medium text-[#4a4f68]">Bank or financial service *<input name="institution" required maxLength={80} defaultValue={selectedAccount?.institution ?? ""} placeholder="e.g. Chase, Wells Fargo, Fidelity" className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-4 py-3 text-[#16192c] outline-none focus:border-[#544af7]" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#4a4f68]">Account type<select name="type" value={accountType} onChange={(event) => setAccountType(event.target.value as AccountTypeValue)} className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 py-3 text-[#16192c] outline-none focus:border-[#544af7]">{AccountType.options.map((type) => <option key={type} value={type}>{ACCOUNT_TYPE_LABEL[type]}</option>)}</select></label>
            {accountType === "loan" && <label className="block text-sm font-medium text-[#4a4f68]">Loan type<select name="loanKind" value={loanKind} onChange={(event) => setLoanKind(event.target.value as "auto" | "personal")} className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 py-3 text-[#16192c] outline-none focus:border-[#544af7]"><option value="auto">Auto loan</option><option value="personal">Personal loan</option></select></label>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#4a4f68]">Current balance *<div className="mt-2 flex items-center rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 focus-within:border-[#544af7]"><span className="text-sm text-[#8d94a8]">$</span><input name="balance" type="number" min="0" step="0.01" required defaultValue={selectedAccount ? (selectedAccount.balanceCents / 100).toFixed(2) : "0.00"} className="w-full bg-transparent px-2 py-3 text-[#16192c] outline-none" /></div></label>
            <label className="block text-sm font-medium text-[#4a4f68]">Annual interest rate / APR<div className="mt-2 flex items-center rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 focus-within:border-[#544af7]"><input name="annualRate" type="number" min="0" max="100" step="0.01" defaultValue={selectedAccount?.annualRate === null || !selectedAccount ? "" : (selectedAccount.annualRate * 100).toFixed(2)} placeholder="Optional" className="w-full bg-transparent px-2 py-3 text-[#16192c] outline-none" /><span className="text-sm text-[#8d94a8]">%</span></div></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#4a4f68]">Minimum payment<div className="mt-2 flex items-center rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 focus-within:border-[#544af7]"><span className="text-sm text-[#8d94a8]">$</span><input name="minimumPayment" type="number" min="0" step="0.01" defaultValue={selectedAccount?.minimumPaymentCents == null ? "" : (selectedAccount.minimumPaymentCents / 100).toFixed(2)} placeholder="Optional" className="w-full bg-transparent px-2 py-3 text-[#16192c] outline-none" /></div></label>
            <label className="block text-sm font-medium text-[#4a4f68]">Promotional rate ends<input name="promoRateEndsOn" type="date" defaultValue={selectedAccount?.promoRateEndsOn ?? ""} className="mt-2 w-full rounded-xl border border-[#e6e9f2] bg-[#f8f9fe] px-3 py-3 text-[#16192c] outline-none focus:border-[#544af7]" /></label>
          </div>
          {error && <p role="alert" className="text-sm text-[#d7465d]">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-[#edf0f7] pt-4"><button type="button" onClick={() => { setShowForm(false); if (!selectedAccount) setSelectedAccount(null); }} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#8d94a8]">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-[#544af7] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : selectedAccount ? "Save changes" : "Add account"}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
