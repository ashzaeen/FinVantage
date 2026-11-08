import {
  ACCOUNT_CATEGORY_LABEL,
  formatUsd,
  type Goal,
  type GoalOutcome,
  type Transaction,
} from "@finvantage/contracts";
import { AnalyticsChart } from "@/components/finance/AnalyticsChart";
import { CreditCards } from "@/components/finance/CreditCards";
import { StatCard } from "@/components/ui/Stat";
import { api } from "@/lib/api";

/* ─── Top Stat Card Icons ──────────────────────────────────────────────────── */
function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72zM20 9v6h-7V9h7zM5 19V5h14v2h-6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h6v2H5z" />
      <circle cx="16" cy="12" r="1.5" />
    </svg>
  );
}

function IncomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  );
}

function SavingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
    </svg>
  );
}

function OutcomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

/* ─── Merchant Logo / Avatar ───────────────────────────────────────────────── */
function MerchantLogo({ name }: { name: string }) {
  const lower = name.toLowerCase();

  if (lower.includes("adobe") || lower.includes("after effect")) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2e0947] text-[#e0a8ff] font-poppins text-xs font-bold shadow-sm">
        Ae
      </div>
    );
  }

  if (lower.includes("mcdonald") || lower.includes("mcd")) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff9ea] border border-[#fef0cd] text-[#ffb800] font-poppins text-base font-black shadow-sm">
        M
      </div>
    );
  }

  // Branded initials fallback
  const colors = [
    ["#e8f3ff", "#2979ff"],
    ["#e6faf4", "#00c48c"],
    ["#f3e8ff", "#9333ea"],
    ["#fff5e6", "#f59e0b"],
    ["#ffecee", "#ff4d6d"],
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const [bg, fg] = colors[idx]!;

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-poppins font-bold text-xs uppercase shadow-sm"
      style={{ backgroundColor: bg, color: fg }}
    >
      {name.slice(0, 2)}
    </div>
  );
}

export default async function OverviewPage() {
  const [netWorth, goals, run, transactions, accounts, spending] = await Promise.all([
    api.getNetWorth(),
    api.listGoals(),
    api.runSimulation({ body: { persist: false } }),
    api.listTransactions(),
    api.listAccounts(),
    api.getSpendingSummary(),
  ]);

  const displayTx = transactions.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* ── Top Header Bar ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-poppins text-3xl font-bold tracking-tight text-[#16192c]">
          Dashboard
        </h1>

        {/* Search bar matching screenshot */}
        <div className="relative min-w-[260px] sm:w-[320px]">
          <input
            type="search"
            placeholder="Search for anything...."
            className="w-full rounded-2xl border border-[#edf0f7] bg-white py-3 pl-4 pr-11 font-roboto text-xs font-normal text-[#16192c] placeholder-[#8d94a8] outline-none shadow-[0_1px_3px_rgba(22,25,44,0.03)] transition-all focus:border-[#544af7]"
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8d94a8]"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* ── Stat Cards (4 Top Cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="Net Worth"
          value={formatUsd(netWorth.netWorthCents)}
          icon={<WalletIcon />}
          iconBg="#fff5e6"
          iconColor="#ff9900"
        />
        <StatCard
          label="Total Assets"
          value={formatUsd(netWorth.assetsCents)}
          icon={<IncomeIcon />}
          iconBg="#e8f3ff"
          iconColor="#2979ff"
        />
        <StatCard
          label="Liabilities"
          value={formatUsd(netWorth.liabilitiesCents)}
          icon={<SavingIcon />}
          iconBg="#e6faf4"
          iconColor="#00c48c"
        />
        <StatCard
          label="Accounts"
          value={String(accounts.length)}
          icon={<OutcomeIcon />}
          iconBg="#ffecee"
          iconColor="#ff4d6d"
        />
      </div>

      {/* ── Middle Section: Analytics + Cards ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6">
        {/* Analytics Card */}
        <div className="rounded-3xl bg-white border border-[#edf0f7] p-7 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
            <h2 className="font-poppins text-lg font-bold text-[#16192c]">
              Analytics
            </h2>

            <div className="flex items-center gap-6">
              {/* Legend (Roboto) */}
              <div className="flex items-center gap-4 font-roboto text-xs font-normal text-[#16192c]">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#544af7]" />
                  Income
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#38d2f0]" />
                  Outcome
                </span>
              </div>

              <span className="text-xs text-[#8d94a8]">Last 6 months</span>
            </div>
          </div>

          <AnalyticsChart data={spending.monthlyTrend} />
        </div>

        {/* Cards Widget */}
        <div className="rounded-3xl bg-white border border-[#edf0f7] p-7 shadow-[0_2px_12px_rgba(22,25,44,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-poppins text-lg font-bold text-[#16192c]">
                Cards
              </h2>
              <button
                type="button"
                className="h-6 w-6 rounded-full border border-[#edf0f7] flex items-center justify-center font-roboto text-xs text-[#8d94a8] hover:text-[#544af7] transition-colors"
                aria-label="Card Information"
              >
                ⓘ
              </button>
            </div>

            <CreditCards />
          </div>

          <a href="/accounts" className="mt-6 block w-full rounded-2xl bg-[#eef1fc] py-3.5 text-center font-roboto text-xs font-medium text-[#544af7] transition-all hover:bg-[#e2e6fc]">
            View all accounts
          </a>
        </div>
      </div>

      {/* ── Bottom Section: Transaction + Instalment ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6">
        {/* Transaction Table */}
        <div className="rounded-3xl bg-white border border-[#edf0f7] p-7 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h2 className="font-poppins text-lg font-bold text-[#16192c]">
              Transaction
            </h2>

            <div className="flex items-center gap-3">
              <a href="/transactions" className="rounded-xl border border-[#edf0f7] bg-white px-3 py-2 font-roboto text-xs font-medium text-[#544af7] hover:border-[#544af7]">View all transactions</a>
            </div>
          </div>

          {/* Table Header Bar */}
          <div className="rounded-xl bg-[#f8f9fd] px-5 py-3 grid grid-cols-[1.5fr_1.2fr_1fr_1fr] font-roboto text-xs font-medium text-[#8d94a8]">
            <span>Name</span>
            <span>Date</span>
            <span>Price</span>
            <span className="text-right">Status</span>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[#edf0f7] mt-1 font-roboto">
            {displayTx.map((tx) => {
              const absAmount = Math.abs(tx.amountCents);
              const formattedPrice = `${tx.amountCents < 0 ? "−" : "+"}$${(absAmount / 100).toFixed(2)}`;

              return (
                <div
                  key={tx.id}
                  className="grid grid-cols-[1.5fr_1.2fr_1fr_1fr] items-center px-5 py-4 text-xs transition-colors hover:bg-[#fafbfe]"
                >
                  {/* Name + Logo */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <MerchantLogo name={tx.merchant} />
                    <span className="font-poppins font-semibold text-[#16192c] truncate">
                      {tx.merchant}
                    </span>
                  </div>

                  {/* Date (Roboto) */}
                  <span className="font-roboto font-normal text-[#8d94a8] whitespace-nowrap">
                    {new Date(`${tx.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>

                  {/* Price (Poppins) */}
                  <span className="font-poppins font-bold text-[#16192c] tabular-nums">
                    {formattedPrice}
                  </span>

                  {/* Status Pill (Roboto) */}
                  <div className="flex justify-end">
                    <span className={`inline-flex rounded-full px-3.5 py-1 font-roboto text-[11px] font-medium ${tx.amountCents >= 0 ? "bg-[#e6faf4] text-[#00c48c]" : "bg-[#ffecee] text-[#ff4d6d]"}`}>
                      {tx.amountCents >= 0 ? "Income" : "Expense"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Instalment Widget */}
        <div className="rounded-3xl bg-white border border-[#edf0f7] p-7 shadow-[0_2px_12px_rgba(22,25,44,0.03)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-poppins text-lg font-bold text-[#16192c]">
              Instalment
            </h2>
            <a
              href="/goals"
              className="font-roboto text-xs font-normal text-[#8d94a8] hover:text-[#544af7] transition-colors"
            >
              See all
            </a>
          </div>

          <div>
            <p className="font-poppins text-xs font-semibold text-[#16192c]">
              House Installments
            </p>

            {/* Progress track */}
            <div className="mt-3 relative h-2.5 w-full bg-[#eef1fa] rounded-full overflow-hidden">
              <div className="h-full bg-[#544af7] rounded-full w-[38%]" />
            </div>

            {/* Collected Rows */}
            <div className="mt-6 space-y-4 font-roboto">
              <div className="flex items-center justify-between text-xs">
                <span className="font-normal text-[#8d94a8]">Collected</span>
                <span className="font-poppins font-semibold text-[#16192c] tabular-nums">
                  $120.00/$2000.00
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-normal text-[#8d94a8]">Collected</span>
                <span className="font-poppins font-semibold text-[#16192c] tabular-nums">
                  $120.00/$2000.00
                </span>
              </div>
            </div>

            {/* Dynamic goals if present */}
            {goals.length > 0 && (
              <div className="mt-6 pt-5 border-t border-[#edf0f7] space-y-3">
                <p className="font-roboto text-[11px] font-medium uppercase tracking-wider text-[#8d94a8]">
                  Active Goals
                </p>
                {goals.slice(0, 2).map((g) => {
                  const pct = Math.min(100, Math.round((g.currentCents / g.targetCents) * 100));
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-poppins font-semibold text-[#16192c] truncate">{g.name}</span>
                        <span className="font-poppins text-[#544af7] font-bold">{pct}%</span>
                      </div>
                      <div className="h-2 bg-[#eef1fa] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#544af7] rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
