import { formatPercent, formatUsd, type SpendingPatterns } from "@finvantage/contracts";
import { HeatGrid } from "@/components/charts/HeatGrid";
import { Card } from "@/components/ui/Card";
import { plural } from "@/lib/format";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const FULL_DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;

function monthTitle(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Where a month's spending lands: a calendar shaded by day (calm days outlined, with the streak),
 * the merchants that took the most, and which weekdays run high. All figures come from
 * `GET /v1/spending/patterns`; this only lays them out.
 */
export function SpendingPatternsCard({ patterns }: { patterns: SpendingPatterns }) {
  const { topMerchants } = patterns;
  const peakDay = patterns.weekday.reduce((best, d) => (d.averageCents > best.averageCents ? d : best), patterns.weekday[0]!);
  const dayMax = Math.max(1, ...patterns.weekday.map((d) => d.averageCents));

  return (
    <Card title="Spending Patterns" subtitle={`${monthTitle(patterns.month)} · by day, by merchant and by weekday`}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="pattern-days">
          <h3 id="pattern-days" className="text-sm font-semibold text-ink">Day by Day</h3>
          <p className="mb-3 mt-0.5 text-xs text-muted">
            {plural(patterns.noSpendDays, "day")} with nothing spent so far. Outlined days are the calm ones.
            {patterns.currentNoSpendStreak > 0 && <> You are on a {plural(patterns.currentNoSpendStreak, "day")} streak.</>}
          </p>
          <HeatGrid month={patterns.month} cents={patterns.dailyCents} today={patterns.through} label={`Money out for each day of ${monthTitle(patterns.month)}`} />
        </section>

        <div className="space-y-6">
          <section aria-labelledby="pattern-merchants">
            <h3 id="pattern-merchants" className="text-sm font-semibold text-ink">Top Merchants</h3>
            {topMerchants.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No spending yet this month.</p>
            ) : (
              <>
                <p className="mb-2 mt-0.5 text-xs text-muted">The top {topMerchants.length} took {formatPercent(patterns.topMerchantsShare)} of this month&apos;s spending.</p>
                <ol className="space-y-2">
                  {topMerchants.map((m, i) => (
                    <li key={m.merchant} className="tile-lift rounded-xl bg-inset px-3 py-2">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate font-medium text-ink">{i + 1}. {m.merchant}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{formatUsd(m.totalCents)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                          <div className="meter-fill h-full rounded-full" style={{ width: `${Math.max(2, m.share * 100)}%`, background: "var(--series-1)", ["--i" as string]: i }} />
                        </div>
                        <span className="shrink-0 text-xs text-muted">{plural(m.visits, "visit")} · {formatPercent(m.share)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>

          <section aria-labelledby="pattern-weekdays">
            <h3 id="pattern-weekdays" className="text-sm font-semibold text-ink">Which Days Cost the Most</h3>
            <p className="mb-2 mt-0.5 text-xs text-muted">
              Average spent per day over the last 90 days. {FULL_DAY_NAMES[peakDay.day]} run highest at {formatUsd(peakDay.averageCents)}; weekdays average {formatUsd(patterns.weekdayAverageCents)} and weekends {formatUsd(patterns.weekendAverageCents)}.
            </p>
            <div className="flex items-end gap-2" role="img" aria-label={patterns.weekday.map((d) => `${DAY_NAMES[d.day]}: ${formatUsd(d.averageCents)}`).join(", ")}>
              {patterns.weekday.map((d, i) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1" aria-hidden="true">
                  <div className="flex h-16 w-full items-end">
                    <span className="bar-grow w-full rounded-t-md" style={{ height: `${Math.max(3, (d.averageCents / dayMax) * 100)}%`, background: "var(--series-1)", opacity: d.day === peakDay.day ? 1 : 0.55, ["--i" as string]: i }} />
                  </div>
                  <span className="text-xs text-muted">{DAY_NAMES[d.day]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Card>
  );
}
