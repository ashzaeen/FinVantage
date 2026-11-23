import { formatPercent, formatUsd, type OverviewInsights } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Sparkline } from "@/components/charts/Sparkline";
import { Card } from "@/components/ui/Card";
import { monthName } from "@/lib/format";

/** The bar runs to six months of cover; the tick marks three, the usual minimum for an emergency fund. */
const RUNWAY_TRACK_MONTHS = 6;
const RUNWAY_TICK_MONTHS = 3;

/**
 * Two small answers for the top of the Overview: how long cash would last, and how much of income
 * is being kept. Every figure comes from `GET /v1/overview/insights`; this lays them out.
 */
export function OverviewHealth({ insights }: { insights: OverviewInsights }) {
  const { runway, savingsRate } = insights;
  const months = runway.months;
  const trend = savingsRate.trend;
  const known = trend.filter((p): p is { month: string; rate: number } => p.rate !== null);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Cash Runway" subtitle="How long checking and savings would cover your spending">
        {months === null ? (
          <p className="text-sm text-muted">Runway appears once there are a few months of spending to average.</p>
        ) : (
          <>
            <p className="font-poppins text-3xl font-bold tabular-nums text-ink">
              {months.toFixed(1)} <span className="text-base font-semibold text-muted">months</span>
            </p>
            <div className="mt-4">
              <BulletBar
                label="Cash Cover"
                valueText={`${formatUsd(runway.liquidCents)} on hand`}
                fill={months / RUNWAY_TRACK_MONTHS}
                target={RUNWAY_TICK_MONTHS / RUNWAY_TRACK_MONTHS}
                targetText={`${RUNWAY_TICK_MONTHS} months`}
                tone={months < RUNWAY_TICK_MONTHS ? "warn" : "accent"}
                note={`Based on ${formatUsd(runway.averageMonthlySpendCents)} spent a month, averaged over the last three full months.`}
              />
            </div>
            <p className="mt-2 text-xs text-muted">The line marks three months, a common minimum for an emergency cushion. This is a guideline, not advice.</p>
          </>
        )}
      </Card>

      <Card title="Savings Rate" subtitle="The share of income you kept this month">
        {savingsRate.rate === null ? (
          <p className="text-sm text-muted">No income has arrived yet this month, so there is no rate to show.</p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-poppins text-3xl font-bold tabular-nums text-ink">{formatPercent(savingsRate.rate)}</p>
              <p className="mt-1 text-sm text-muted">
                {formatUsd(savingsRate.savedCents)} saved of {formatUsd(savingsRate.incomeCents)} in
              </p>
            </div>
            {known.length >= 2 && (
              <div className="text-right">
                <Sparkline
                  values={known.map((p) => p.rate)}
                  width={120}
                  height={36}
                  label={`Savings rate by month: ${known.map((p) => `${monthName(p.month)} ${formatPercent(p.rate)}`).join(", ")}`}
                />
                <p className="mt-1 text-xs text-muted">Last {known.length} months</p>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Saved means money moved to savings and investing. Spending is counted separately.</p>
      </Card>
    </div>
  );
}
