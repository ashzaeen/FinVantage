import type { CSSProperties } from "react";
import Link from "next/link";
import { formatUsd } from "@finvantage/contracts";
import { CategoryIcon } from "@/components/spending/CategoryIcon";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { flagDetail, needsLook, shortDate, upcomingWithin } from "@/lib/subscriptions";
import { FlagChip } from "./SubscriptionRow";
import { SubscriptionsClient } from "./SubscriptionsClient";

/** How far ahead the Upcoming Charges card looks. */
const UPCOMING_DAYS = 30;

function Tile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="tile-lift rounded-2xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>{label}</p>
      <p className="font-poppins mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{children}</p>
      {hint && <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>{hint}</p>}
    </div>
  );
}

export default async function SubscriptionsPage() {
  const [overview, categories] = await Promise.all([api.listSubscriptions(), api.listSpendingCategories()]);
  const labels = Object.fromEntries(categories.map((c) => [c.id, c.label]));
  const labelOf = (id: string | null) => (id ? (labels[id] ?? id) : "Uncategorized");
  const all = [...overview.subscriptions, ...overview.bills];
  // A cancelled subscription that charged again needs a look too, so it joins the ones still active.
  const flagged = needsLook([...all, ...overview.cancelled]);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = upcomingWithin(all, today, UPCOMING_DAYS);
  const { subscriptionTotals: totals } = overview;

  if (all.length === 0) {
    return (
      <>
        <PageHeader title="Subscriptions" />
        <Card title="No Recurring Charges Yet" lift={false}>
          <p className="text-sm" style={{ color: "var(--ink-secondary)" }}>
            FinVantage finds subscriptions and bills from your linked accounts and transactions. Link a bank or add a few
            transactions, and the charges that repeat will appear here.
          </p>
          <Link href="/accounts" className="mt-4 inline-block rounded-xl px-4 py-2 text-sm font-medium text-white" style={{ background: "var(--accent)" }}>
            Go to Accounts
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Subscriptions" />
      <p className="-mt-4 mb-6 max-w-2xl text-sm" style={{ color: "var(--ink-secondary)" }}>
        Every charge that repeats, split into what you chose to pay for and what you owe. FinVantage points out what changed
        and helps you act, but it never cancels or pays anything for you.
      </p>

      <div className="page-cascade space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Monthly Cost" hint="Subscriptions only">
            <CountUp value={totals.monthlyCents} />
          </Tile>
          <Tile label="Yearly Cost" hint="Subscriptions only">
            <CountUp value={totals.annualCents} />
          </Tile>
          <Tile label="Active Subscriptions" hint={totals.unknownCadenceCount > 0 ? `${totals.unknownCadenceCount} with no known schedule` : undefined}>
            <CountUp value={totals.count} format="number" />
          </Tile>
          <Tile label="Share of Income" hint={overview.shareOfIncome === null ? "Add your income to see this" : "Of monthly income"}>
            {overview.shareOfIncome === null ? "Not Available" : <CountUp value={overview.shareOfIncome} format="percent" />}
          </Tile>
        </div>

        <Card title="Needs a Look" subtitle="Charges that changed or may be doubled up" lift={false}>
          {flagged.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Nothing needs a look right now. You will see price rises, doubled-up services and new charges here.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {flagged.map((item, i) => (
                <li key={item.id} className="row-cascade tile-lift rounded-xl p-3" style={{ background: "var(--surface-inset)", "--i": i } as CSSProperties}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <CategoryIcon id={item.category} />
                      <span className="truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{item.merchant}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(Math.abs(item.amountCents))}</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {item.flags.map((flag) => (
                      <li key={flag.type} className="flex flex-wrap items-center gap-2">
                        <FlagChip type={flag.type} />
                        <span className="text-xs" style={{ color: "var(--ink-secondary)" }}>{flagDetail(flag, item)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <SubscriptionsClient
          subscriptions={overview.subscriptions}
          bills={overview.bills}
          cancelled={overview.cancelled}
          billTotals={overview.billTotals}
          savedSoFarCents={overview.savedSoFarCents}
          labels={labels}
        />

        <Card title="Upcoming Charges" subtitle={`The next ${UPCOMING_DAYS} days, soonest first`} lift={false}>
          {upcoming.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Nothing is due in the next {UPCOMING_DAYS} days.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {upcoming.map((item, i) => (
                <li key={item.id} className="row-cascade tile-lift flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--surface-inset)", "--i": i } as CSSProperties}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{shortDate(item.nextDate)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium" style={{ color: "var(--ink)" }}>{item.merchant}</span>
                      <span className="text-xs" style={{ color: "var(--ink-muted)" }}>{labelOf(item.category)} · {item.kind === "bill" ? "Bill" : "Subscription"}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatUsd(Math.abs(item.amountCents))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
