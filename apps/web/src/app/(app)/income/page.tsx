import type { CSSProperties, ReactNode } from "react";
import { formatPercent, formatUsd, type IncomeSummary, type SpendingCategory } from "@finvantage/contracts";
import { plural } from "@/lib/format";
import { seriesColor } from "@/lib/chartColors";
import { CategoryPie } from "@/components/spending/CategoryPie";
import { Card } from "@/components/ui/Card";
import { CountUp } from "@/components/ui/CountUp";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

// Income is the money-in green and spending the money-out red on every page that pairs them.
const INCOME_BAR = "var(--flow-in)";
const SPENDING_BAR = "var(--flow-out)";

const monthName = (month: string, style: "short" | "long" = "short") =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: style });
const monthYear = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const dayName = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const STABILITY: Record<IncomeSummary["stability"], { label: string; note: string }> = {
  steady: { label: "Steady", note: "Your last three full months landed within 15% of each other." },
  varies: { label: "Varies", note: "Your income moved by more than 15% between the last three full months." },
  not_enough_data: { label: "Not Enough Data", note: "It takes three full months of deposits to judge." },
};

/** Lenders often use 36% as the comfortable line and 43% as the ceiling. A rule of thumb, not advice. */
function debtBand(ratio: number) {
  if (ratio <= 0.36) return { label: "Comfortable", color: "var(--gain)" };
  if (ratio <= 0.43) return { label: "Getting Tight", color: "var(--warning)" };
  return { label: "High", color: "var(--loss)" };
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="tile-lift rounded-2xl p-3" style={{ background: "var(--surface-inset)" }}>
      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums" style={{ color: "var(--ink)" }}>{value}</p>
    </div>
  );
}

function ExpectedIncome({ income }: { income: IncomeSummary }) {
  const expected = income.expectedMonthlyCents;
  const reached = expected > 0 ? Math.min(1, income.thisMonthCents / expected) : 0;
  const diff = income.thisMonthCents - income.lastMonthCents;
  return (
    <Card title="Expected Income">
      {expected > 0 ? (
        <>
          <p className="font-poppins text-3xl font-bold tabular-nums" style={{ color: "var(--ink)" }}><CountUp value={expected} /></p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
            Expected each month. {formatUsd(income.thisMonthCents)} received in {monthName(income.month, "long")} so far.
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-full" style={{ background: "var(--surface-inset)" }}>
            <div className="meter-fill h-full rounded-full" style={{ width: `${reached * 100}%`, background: INCOME_BAR }} />
          </div>
          <p className="mt-1.5 text-xs" style={{ color: "var(--ink-muted)" }}>{formatPercent(reached)} received</p>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
          No expected monthly income is set on your profile. {formatUsd(income.thisMonthCents)} received in {monthName(income.month, "long")} so far.
        </p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniStat label="Last Month" value={<CountUp value={income.lastMonthCents} />} />
        <MiniStat label="3-Month Average" value={<CountUp value={income.averageMonthlyCents} />} />
        <MiniStat label="Year to Date" value={<CountUp value={income.yearToDateCents} />} />
      </div>
      {income.lastMonthCents > 0 && (
        <p className="mt-3 text-xs" style={{ color: diff >= 0 ? "var(--gain)" : "var(--loss)" }}>
          {diff >= 0 ? "Up" : "Down"} {formatUsd(Math.abs(diff))} from last month
        </p>
      )}
    </Card>
  );
}

function IncomePie({ income, categories }: { income: IncomeSummary; categories: SpendingCategory[] }) {
  return (
    <CategoryPie
      title="Income by Category"
      period={monthYear(income.month)}
      totalNote="received"
      rootId="income"
      centerLabel="This Month"
      emptyText="No income yet this month."
      categories={categories}
      breakdown={income.categories.map((c) => ({ categoryId: c.categoryId, spentCents: c.totalCents }))}
    />
  );
}

function TrendBars({ trend }: { trend: IncomeSummary["trend"] }) {
  const max = Math.max(1, ...trend.flatMap((r) => [r.incomeCents, r.spendingCents]));
  return (
    <Card title="Income vs Spending">
      <div className="flex h-44 items-end gap-3" role="img" aria-label="Income and spending for each of the last six months">
        {trend.map((row, i) => (
          <div key={row.month} className="flex h-full flex-1 flex-col justify-end gap-1" style={{ "--i": i } as CSSProperties}>
            <div className="flex flex-1 items-end justify-center gap-1">
              <div
                title={`Income ${formatUsd(row.incomeCents)}`}
                className="bar-grow w-full max-w-6 rounded-t-md"
                style={{ height: `${(row.incomeCents / max) * 100}%`, minHeight: row.incomeCents ? 3 : 0, background: INCOME_BAR }}
              />
              <div
                title={`Spending ${formatUsd(row.spendingCents)}`}
                className="bar-grow w-full max-w-6 rounded-t-md"
                style={{ height: `${(row.spendingCents / max) * 100}%`, minHeight: row.spendingCents ? 3 : 0, background: SPENDING_BAR }}
              />
            </div>
            <p className="text-center text-xs" style={{ color: "var(--ink-muted)" }}>{monthName(row.month)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs" style={{ color: "var(--ink-secondary)" }}>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: INCOME_BAR }} />Income</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: SPENDING_BAR }} />Spending</span>
      </div>
    </Card>
  );
}

/** The next likely paycheck, worked out by the API from the days recent paychecks landed on. */
function NextPayday({ income }: { income: IncomeSummary }) {
  const next = income.nextPayday;
  return (
    <Card title="Next Payday">
      {next ? (
        <>
          <p className="font-poppins text-3xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
            {next.daysAway === 1 ? "Tomorrow" : `In ${plural(next.daysAway, "day")}`}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
            {dayName(next.date)}, about <strong style={{ color: "var(--ink)" }}>{formatUsd(next.expectedCents)}</strong> if it is the usual amount.
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>Based on the days your recent paychecks arrived. A change at work can move it.</p>
        </>
      ) : (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Once a few paychecks have arrived, the next one shows here.</p>
      )}
    </Card>
  );
}

/** Where each month's income came from, stacked, so a drop in one source shows up as a thinner band. */
function SourcesOverTime({ income, categories }: { income: IncomeSummary; categories: SpendingCategory[] }) {
  const labelOf = new Map(categories.map((c) => [c.id, c.label]));
  const totals = new Map<string, number>();
  for (const m of income.sourcesByMonth) for (const c of m.categories) totals.set(c.categoryId, (totals.get(c.categoryId) ?? 0) + c.totalCents);
  // The biggest source gets the first colour, as in every other chart; past six they share the grey.
  const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const colour = (id: string) => seriesColor(ranked.indexOf(id));
  const peak = Math.max(1, ...income.sourcesByMonth.map((m) => m.categories.reduce((sum, c) => sum + c.totalCents, 0)));
  if (ranked.length === 0) return null;
  return (
    <Card title="Income Sources Over Time" subtitle="Each month, by where it came from">
      <div className="flex h-44 items-end gap-3" role="img" aria-label={income.sourcesByMonth.map((m) => `${monthName(m.month)}: ${m.categories.map((c) => `${labelOf.get(c.categoryId) ?? c.categoryId} ${formatUsd(c.totalCents)}`).join(", ") || "none"}`).join(". ")}>
        {income.sourcesByMonth.map((row, i) => (
          <div key={row.month} className="flex h-full flex-1 flex-col justify-end gap-1">
            <div className="bar-grow flex w-full max-w-10 flex-col-reverse self-center overflow-hidden rounded-t-md" style={{ height: `${(row.categories.reduce((sum, c) => sum + c.totalCents, 0) / peak) * 100}%`, "--i": i } as CSSProperties}>
              {[...row.categories].sort((a, b) => ranked.indexOf(b.categoryId) - ranked.indexOf(a.categoryId)).map((c) => (
                <div key={c.categoryId} title={`${labelOf.get(c.categoryId) ?? c.categoryId}: ${formatUsd(c.totalCents)}`} style={{ flexGrow: c.totalCents, background: colour(c.categoryId) }} />
              ))}
            </div>
            <p className="text-center text-xs" style={{ color: "var(--ink-muted)" }}>{monthName(row.month)}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink-secondary)" }}>
        {ranked.slice(0, 6).map((id) => (
          <li key={id} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: colour(id) }} />{labelOf.get(id) ?? id}</li>
        ))}
      </ul>
    </Card>
  );
}

function DebtRatio({ income }: { income: IncomeSummary }) {
  const { ratio, monthlyDebtCents, monthlyIncomeCents } = income.debtToIncome;
  const band = ratio === null ? null : debtBand(ratio);
  return (
    <Card title="Debt-to-Income">
      {ratio === null || !band ? (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Set a monthly income on your profile to see this.</p>
      ) : (
        <>
          <p className="font-poppins text-4xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{formatPercent(ratio)}</p>
          <p className="mt-1 text-sm font-semibold" style={{ color: band.color }}>{band.label}</p>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-secondary)" }}>
            {formatUsd(monthlyDebtCents)} a month goes to debt payments, out of {formatUsd(monthlyIncomeCents)} of monthly income.
          </p>
          <div className="relative mt-4 h-3 rounded-full" style={{ background: "var(--surface-inset)" }}>
            <div className="meter-fill h-full rounded-full" style={{ width: `${Math.min(1, ratio / 0.6) * 100}%`, background: band.color }} />
            <i className="absolute -top-1 h-5 w-px" style={{ left: `${(0.36 / 0.6) * 100}%`, background: "var(--ink-muted)" }} />
            <i className="absolute -top-1 h-5 w-px" style={{ left: `${(0.43 / 0.6) * 100}%`, background: "var(--ink-muted)" }} />
          </div>
          <div className="mt-1 flex justify-between text-xs" style={{ color: "var(--ink-muted)" }}>
            <span>0%</span><span>36%</span><span>43%</span><span>60%+</span>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
            Lenders often look for 36% or less. This is a rule of thumb, not advice.
          </p>
        </>
      )}
    </Card>
  );
}

function RecentDeposits({ income }: { income: IncomeSummary }) {
  return (
    <Card title="Recent Deposits">
      {income.recent.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No deposits yet.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {income.recent.map((t, i) => (
            <li key={t.id} className="row-cascade flex items-center justify-between gap-3 py-2.5 text-sm" style={{ "--i": i } as CSSProperties}>
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink)" }}>{t.merchant}</span>
              <span className="w-14 shrink-0 text-xs tabular-nums" style={{ color: "var(--ink-muted)" }}>{dayName(t.date)}</span>
              <span className="w-24 shrink-0 text-right font-bold tabular-nums" style={{ color: "var(--ink)" }}>+{formatUsd(t.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stability({ income }: { income: IncomeSummary }) {
  const stability = STABILITY[income.stability];
  const lastThree = income.trend.slice(-4, -1);
  return (
    <Card title="Income Stability">
      <p className="font-poppins text-2xl font-bold" style={{ color: "var(--ink)" }}>{stability.label}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-secondary)" }}>{stability.note}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {lastThree.map((r) => (
          <MiniStat key={r.month} label={monthName(r.month, "long")} value={formatUsd(r.incomeCents)} />
        ))}
      </div>
      <p className="mt-4 text-sm font-semibold" style={{ color: "var(--ink)" }}>
        {income.savingsRate === null ? "No savings rate yet" : `You kept ${formatPercent(Math.max(0, income.savingsRate))} of income`}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
        Income minus spending over the last six months, as a share of income.
      </p>
    </Card>
  );
}

/** Sources whose monthly total moves a lot: the typical month as the fill, the low to high range as a band. */
function Variability({ income, categories }: { income: IncomeSummary; categories: SpendingCategory[] }) {
  if (income.variability.length === 0) return null;
  const label = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const top = Math.max(1, ...income.variability.map((v) => v.highCents));
  const share = (cents: number) => `${(cents / top) * 100}%`;
  return (
    <Card title="Income That Moves" subtitle="Sources that change from month to month" lift={false}>
      <ul className="space-y-4">
        {income.variability.map((v) => {
          const sentence = `${label(v.categoryId)} usually brings ${formatUsd(v.typicalCents)}, from ${formatUsd(v.lowCents)} to ${formatUsd(v.highCents)}.`;
          return (
            <li key={v.categoryId}>
              <p className="text-sm text-ink">{sentence}</p>
              <div className="relative mt-2 h-2.5 rounded-full bg-inset" aria-hidden="true">
                <div className="absolute inset-y-0 rounded-full bg-accent-soft" style={{ left: share(v.lowCents), width: `calc(${share(v.highCents)} - ${share(v.lowCents)})` }} />
                <div className="meter-fill absolute inset-y-0 left-0 rounded-full" style={{ width: share(v.typicalCents), background: "var(--flow-in)" }} />
              </div>
              <p className="mt-1 text-xs text-muted">Over {plural(v.months, "month")} with income.</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default async function IncomePage() {
  const [income, categories] = await Promise.all([api.getIncomeSummary(), api.listSpendingCategories()]);

  return (
    <>
      <PageHeader title="Income" />
      <div className="page-cascade grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        <ExpectedIncome income={income} />
        <IncomePie income={income} categories={categories} />
        <TrendBars trend={income.trend} />
        <SourcesOverTime income={income} categories={categories} />
        <NextPayday income={income} />
        <DebtRatio income={income} />
        <RecentDeposits income={income} />
        <Stability income={income} />
        <Variability income={income} categories={categories} />
      </div>
    </>
  );
}
