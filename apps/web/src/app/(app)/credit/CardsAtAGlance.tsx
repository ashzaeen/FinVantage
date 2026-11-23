import { formatPercent, formatUsd, type CreditCardsOverview } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { DotCalendar, type CalendarEvent } from "@/components/charts/DotCalendar";
import { Card } from "@/components/ui/Card";
import { plural, shortDate } from "@/lib/format";

/** Credit-scoring guidance usually names 30% as the line to stay under. A rule of thumb, not advice. */
const UTILIZATION_LINE = 0.3;
const CALENDAR_DAYS = 35;

function dueText(days: number | null, date: string | null): string {
  if (days === null || !date) return "No due date on file";
  if (days < 0) return `Was due ${shortDate(date)}, ${plural(-days, "day")} ago`;
  if (days === 0) return `Due today, ${shortDate(date)}`;
  return `Due ${shortDate(date)}, in ${plural(days, "day")}`;
}

/**
 * Each card on one line of facts: how much of its limit is used, what the balance costs each
 * month, when the next payment is due, and, for a 0% card, what to pay to clear it in time. A
 * calendar marks the due dates. Every figure comes from `GET /v1/credit/cards`.
 */
export function CardsAtAGlance({ overview }: { overview: CreditCardsOverview }) {
  const { cards, totals } = overview;
  if (cards.length === 0) return null;
  const events: CalendarEvent[] = cards.flatMap((c) =>
    c.nextPaymentDueOn
      ? [{ date: c.nextPaymentDueOn, tone: c.daysUntilDue !== null && c.daysUntilDue <= 7 ? ("warn" as const) : ("info" as const), label: `${c.name} payment due`, amountCents: c.minimumPaymentCents ?? undefined }]
      : [],
  );

  return (
    <Card title="Cards at a Glance" subtitle="Use, interest cost and due dates for each card">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <ul className="space-y-5">
          {cards.map((c, i) => (
            <li key={c.id} className="min-w-0">
              <BulletBar
                label={`${c.name}${c.mask ? ` ·· ${c.mask}` : ""}`}
                valueText={c.utilization === null ? formatUsd(c.balanceCents) : `${formatUsd(c.balanceCents)} of ${formatUsd(c.limitCents!)}`}
                fill={c.utilization ?? 0}
                target={UTILIZATION_LINE}
                targetText="30%"
                tone={c.utilization !== null && c.utilization > UTILIZATION_LINE ? "warn" : "accent"}
                index={i}
              />
              <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
                <div><dt className="inline">Used: </dt><dd className="inline font-medium text-ink">{c.utilization === null ? "No limit on file" : formatPercent(c.utilization)}</dd></div>
                <div>
                  <dt className="inline">Interest: </dt>
                  <dd className="inline font-medium text-ink">
                    {c.annualRate === null ? "Rate not on file" : c.monthlyInterestCents === 0 ? "None at 0%" : `${formatUsd(c.monthlyInterestCents)} a month at ${(c.annualRate * 100).toFixed(2).replace(/\.?0+$/, "")}%`}
                  </dd>
                </div>
                <div className={c.daysUntilDue !== null && c.daysUntilDue < 0 ? "text-loss" : undefined}>
                  <dt className="inline">Payment: </dt>
                  <dd className="inline font-medium text-ink">{dueText(c.daysUntilDue, c.nextPaymentDueOn)}</dd>
                </div>
                {c.promoClear && c.promoRateEndsOn && (
                  <div>
                    <dt className="inline">0% ends: </dt>
                    <dd className="inline font-medium text-ink">{shortDate(c.promoRateEndsOn)}, in {plural(c.promoClear.daysLeft, "day")}. Paying {formatUsd(c.promoClear.monthlyToClearCents)} a month clears it in time.</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-2 text-xs font-semibold text-ink">Payment Due Dates</p>
          <DotCalendar from={overview.asOf} days={CALENDAR_DAYS} events={events} label={`Card payments due in the next ${CALENDAR_DAYS} days`} />
        </div>
      </div>
      <p className="mt-5 border-t border-line pt-3 text-xs text-muted">
        Together your cards use {totals.utilization === null ? "an unknown share of their limits" : `${formatPercent(totals.utilization)} of their limits`}
        {totals.monthlyInterestCents > 0 ? ` and cost about ${formatUsd(totals.monthlyInterestCents)} a month in interest` : ""}. The line on each bar marks 30%, a common guideline.
      </p>
    </Card>
  );
}
