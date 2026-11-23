import { formatUsd, type OverviewInsights } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Card } from "@/components/ui/Card";

/** The bar runs to six months of cover; the tick marks three, the usual minimum for an emergency fund. */
const RUNWAY_TRACK_MONTHS = 6;
const RUNWAY_TICK_MONTHS = 3;

/** How long checking and savings would cover spending. From `GET /v1/overview/insights`; this lays it out. */
export function CashRunway({ insights }: { insights: OverviewInsights }) {
  const { runway } = insights;
  const months = runway.months;
  return (
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
  );
}
