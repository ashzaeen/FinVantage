import Link from "next/link";
import { PiggyBank, ReceiptText, Repeat, TrendingUp, Wallet } from "lucide-react";
import { formatUsd } from "@finvantage/contracts";
import { AnalyticsChart } from "@/components/finance/AnalyticsChart";
import { CreditCards } from "@/components/finance/CreditCards";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { StatCard } from "@/components/ui/Stat";
import { OverviewCharts } from "./OverviewCharts";
import { OverviewHealth } from "./OverviewHealth";
import { MoneyCalendarCard } from "./OverviewCalendar";
import { AttentionStrip, HealthScoreCard, SafeToSpendCard } from "./OverviewPlanning";
import { OverviewSearch } from "./OverviewSearch";
import { api } from "@/lib/api";
import { needsLook } from "@/lib/subscriptions";

/* ─── Merchant Logo / Avatar ───────────────────────────────────────────────── */
// Brand colors of the merchants they stand for: the same in both themes.
const ADOBE_LOGO = "bg-[#2e0947] text-[#e0a8ff]"; // theme-ok
const MCD_LOGO = "bg-[#fff9ea] border border-[#fef0cd] text-[#ffb800]"; // theme-ok

function MerchantLogo({ name }: { name: string }) {
  const lower = name.toLowerCase();

  if (lower.includes("adobe") || lower.includes("after effect")) {
    return (
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ADOBE_LOGO} font-poppins text-xs font-bold shadow-sm`}>
        Ae
      </div>
    );
  }

  if (lower.includes("mcdonald") || lower.includes("mcd")) {
    return (
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${MCD_LOGO} font-poppins text-base font-black shadow-sm`}>
        M
      </div>
    );
  }

  // Branded initials fallback
  const colors = [1, 2, 3, 4, 5, 6].map((n) => [`color-mix(in srgb, var(--series-${n}) 14%, var(--surface-raised))`, `color-mix(in srgb, var(--series-${n}) 55%, var(--ink))`]);
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
  const [netWorth, goals, transactions, accounts, spending, investments, categories, subscriptions, insights, attention, safeToSpend, health, calendar] = await Promise.all([
    api.getNetWorth(),
    api.listGoals(),
    api.listTransactions({ query: { limit: 500 } }),
    api.listAccounts(),
    api.getSpendingSummary(),
    api.getInvestments(),
    api.listSpendingCategories(),
    // A card, not the page: if this fails, the card is left out and everything else still shows.
    api.listSubscriptions().catch(() => null),
    // Also a card, not the page.
    api.getOverviewInsights().catch(() => null),
    api.getAttention().catch(() => null),
    api.getSafeToSpend().catch(() => null),
    api.getHealthScore().catch(() => null),
    api.getMoneyCalendar().catch(() => null),
  ]);

  const displayTx = transactions.slice(0, 5);
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryLabels = new Map(categories.map((category) => [category.id, category.label]));
  const investmentView = investments.views[0];

  return (
    <div className="space-y-8">
      {/* ── Top Header Bar ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-poppins text-3xl font-bold tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-sm text-muted">Your financial picture at a glance.</p>
        </div>
        <OverviewSearch accounts={accounts} goals={goals} transactions={transactions} />
      </div>

      {/* ── Financial Summary ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Net Worth"
          className="col-span-2 xl:col-span-1"
          value={formatUsd(netWorth.netWorthCents)}
          detail={`Assets ${formatUsd(netWorth.assetsCents)} · Liabilities ${formatUsd(netWorth.liabilitiesCents)}`}
          icon={<Wallet size={22} strokeWidth={2} aria-hidden="true" />}
          iconBg="var(--accent-soft)"
          iconColor="var(--accent-ink)"
          href="/accounts"
        />
        <StatCard
          label="Spent This Month"
          value={formatUsd(spending.spentCents)}
          detail="Savings and investing not included"
          icon={<ReceiptText size={22} strokeWidth={2} aria-hidden="true" />}
          iconBg="var(--accent-soft)"
          iconColor="var(--accent-ink)"
          href="/spending"
        />
        <StatCard
          label="Saved This Month"
          value={formatUsd(spending.savedCents)}
          detail="Moved to savings and investments"
          icon={<PiggyBank size={22} strokeWidth={2} aria-hidden="true" />}
          iconBg="var(--accent-soft)"
          iconColor="var(--accent-ink)"
          href="/spending"
        />
        <StatCard
          label="Investments"
          value={formatUsd(investmentView.totalValueCents)}
          icon={<TrendingUp size={22} strokeWidth={2} aria-hidden="true" />}
          iconBg="var(--accent-soft)"
          iconColor="var(--accent-ink)"
          badge={<MockedBadge />}
          href="/portfolio"
        />
      </div>

      {attention && <AttentionStrip feed={attention} />}

      {(safeToSpend || health) && (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {safeToSpend && <SafeToSpendCard safe={safeToSpend} />}
          {health && <HealthScoreCard health={health} />}
        </div>
      )}

      {calendar && <MoneyCalendarCard cal={calendar} />}

      {insights && <OverviewHealth insights={insights} />}

      {/* ── Subscriptions ────────────────────────────────────────────── */}
      {subscriptions && (
        <Link
          href="/subscriptions"
          className="block rounded-3xl border border-line bg-raised p-5 [box-shadow:var(--shadow-resting)] transition duration-200 hover:border-[color:var(--border-accent)] hover:[box-shadow:var(--shadow-lift)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                <Repeat size={22} strokeWidth={2} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-poppins text-lg font-bold text-ink">Subscriptions</h2>
                <p className="mt-0.5 text-xs text-muted">Charges that repeat, and what needs a look</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Monthly Cost</dt>
                <dd className="font-poppins text-xl font-bold tabular-nums text-ink">{formatUsd(subscriptions.subscriptionTotals.monthlyCents)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Active</dt>
                <dd className="font-poppins text-xl font-bold tabular-nums text-ink">{subscriptions.subscriptionTotals.count}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Needs a Look</dt>
                <dd className="font-poppins text-xl font-bold tabular-nums text-ink">
                  {needsLook([...subscriptions.subscriptions, ...subscriptions.bills, ...subscriptions.cancelled]).length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Saved So Far</dt>
                <dd className="font-poppins text-xl font-bold tabular-nums text-ink">{formatUsd(subscriptions.savedSoFarCents)}</dd>
              </div>
            </dl>
          </div>
        </Link>
      )}

      {/* ── Cash Flow and Credit Accounts ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* Analytics Card */}
        <div className="flex min-h-[620px] flex-col rounded-3xl border border-line bg-raised p-5 [box-shadow:var(--shadow-resting)] sm:p-6">
          {/* Header */}
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div><h2 className="font-poppins text-lg font-bold text-ink">Cash Flow</h2><p className="mt-0.5 text-xs text-muted">Recent months with activity · USD</p></div>
          </div>

          <AnalyticsChart data={spending.monthlyTrend} />
        </div>

        {/* Credit Card Accounts */}
        <div className="rounded-3xl bg-raised border border-line p-5 [box-shadow:var(--shadow-resting)] sm:p-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-poppins text-lg font-bold text-ink">Credit Cards</h2>
            </div>

            <CreditCards accounts={accounts} />
          </div>

          <a href="/accounts" className="mt-6 block w-full rounded-2xl bg-accent-soft py-3.5 text-center font-roboto text-xs font-medium text-accent-ink transition-all hover:bg-accent-soft-hover">
            View all accounts
          </a>
        </div>
      </div>

      <section aria-label="Financial charts" className="space-y-4">
        <div><h2 className="font-poppins text-xl font-bold text-ink">Financial Overview</h2><p className="mt-1 text-sm text-muted">Explore your balances, spending, and investments.</p></div>
        <OverviewCharts netWorth={netWorth} spending={spending} categories={categories} investments={investments} />
      </section>

      {/* ── Recent Transactions ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6">
        {/* Transaction Table */}
        <div className="rounded-3xl bg-raised border border-line p-5 [box-shadow:var(--shadow-resting)] sm:p-6">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h2 className="font-poppins text-lg font-bold text-ink">
              Recent Transactions
            </h2>

            <div className="flex items-center gap-3">
              <a href="/transactions" className="flex min-h-11 items-center rounded-xl border border-line bg-raised px-3 py-2 font-roboto text-xs font-medium text-accent-ink hover:border-accent-ink">View all transactions</a>
            </div>
          </div>

          {/* Table Header Bar */}
          <div className="hidden rounded-xl bg-inset px-5 py-3 grid-cols-[1.5fr_1.2fr_1fr_1fr] font-roboto text-xs font-medium text-muted sm:grid">
            <span>Name</span>
            <span>Date</span>
            <span>Category</span>
            <span className="text-right">Amount</span>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-line mt-1 font-roboto">
            {displayTx.length ? displayTx.map((tx) => {
              const formattedPrice = `${tx.amountCents < 0 ? "−" : "+"}${formatUsd(Math.abs(tx.amountCents))}`;
              const accountName = accountNames.get(tx.accountId);

              return (
                <div
                  key={tx.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-2 py-3 text-xs transition-colors hover:bg-surface sm:grid-cols-[1.5fr_1.2fr_1fr_1fr] sm:gap-4 sm:px-5 sm:py-4"
                >
                  {/* Name + Logo */}
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <MerchantLogo name={tx.merchant} />
                    <span className="font-poppins font-semibold text-ink truncate">
                      {tx.merchant}
                    </span>
                  </div>

                  {/* Date (Roboto) */}
                  <span className="col-start-1 pl-[52px] font-roboto font-normal text-muted whitespace-nowrap sm:col-auto sm:pl-0">
                    {new Date(`${tx.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>

                  {/* Category and account */}
                  <span className="col-start-1 truncate pl-[52px] text-muted sm:col-auto sm:pl-0">
                    {categoryLabels.get(tx.subcategory ?? tx.category ?? "") ?? categoryLabels.get(tx.category ?? "") ?? "Uncategorized"}{accountName ? <span className="hidden lg:inline"> · {accountName}</span> : null}
                  </span>

                  {/* Amount */}
                  <span className={`col-start-2 row-start-1 text-right font-poppins font-bold tabular-nums sm:col-auto sm:row-auto ${tx.amountCents >= 0 ? "text-gain" : "text-ink"}`}>
                    {formattedPrice}
                  </span>
                </div>
              );
            }) : <div className="py-12 text-center">
              <p className="text-sm font-semibold text-ink">No transactions yet</p>
              <p className="mt-1 text-xs text-muted">Add a transaction to see your recent activity here.</p>
              <a href="/transactions" className="mt-3 inline-flex rounded-xl bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-soft-hover">Go to Transactions</a>
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
