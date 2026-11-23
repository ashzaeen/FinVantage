import { formatUsd, type MoneyCalendar } from "@finvantage/contracts";
import { DotCalendar, type CalendarEvent } from "@/components/charts/DotCalendar";
import { Card } from "@/components/ui/Card";
import { compactUsd, shortDate } from "@/lib/format";

const W = 520;
const H = 120;
const PAD = { left: 44, right: 10, top: 8, bottom: 18 };

/** Checking at the end of each day, as a line, with a zero rule when the line dips under it. */
function BalanceLine({ cal }: { cal: MoneyCalendar }) {
  const lo = Math.min(0, ...cal.balanceByDay);
  const hi = Math.max(1, ...cal.balanceByDay);
  const x = (i: number) => PAD.left + (i / (cal.balanceByDay.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const lowIndex = cal.balanceByDay.indexOf(cal.lowestCents);
  return (
    <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[30rem] max-w-[44rem]" role="img" aria-label={`Projected checking balance over ${cal.days} days. Lowest point ${formatUsd(cal.lowestCents)} on ${shortDate(cal.lowestDate)}.`}>
      {[hi, lo].map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">{compactUsd(v)}</text>
        </g>
      ))}
      {lo < 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--warning)" strokeDasharray="4 3" />}
      <polyline points={cal.balanceByDay.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lowIndex)} cy={y(cal.lowestCents)} r={3.5} fill="var(--warning)" />
      <text x={PAD.left} y={H - 3} fontSize={12} fill="var(--ink-muted)">{shortDate(cal.asOf)}</text>
    </svg></div>
  );
}

/** The next thirty days: what comes in, what goes out, and where checking dips. A projection, not a promise. */
export function MoneyCalendarCard({ cal }: { cal: MoneyCalendar }) {
  const events: CalendarEvent[] = cal.events.map((e) => ({
    date: e.date,
    tone: e.kind === "payday" ? "in" : e.kind === "card_due" ? "warn" : "out",
    label: e.label,
    ...(e.amountCents !== null ? { amountCents: e.amountCents } : {}),
  }));
  const dips = cal.lowestCents < cal.startingCents;
  return (
    <Card title="Money Calendar" subtitle="The next 30 days: paydays, bills and card payments" lift={false}>
      <p className="mb-3 text-sm text-ink">
        {cal.lowestCents < 0
          ? <>Checking could dip to <strong>{formatUsd(cal.lowestCents)}</strong> around {shortDate(cal.lowestDate)}. Consider moving a bill or a payment.</>
          : dips
            ? <>Checking is lowest, about <strong>{formatUsd(cal.lowestCents)}</strong>, around {shortDate(cal.lowestDate)}.</>
            : <>Checking does not dip below today&apos;s {formatUsd(cal.startingCents)} in the next {cal.days} days.</>}
      </p>
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        <DotCalendar from={cal.asOf} days={cal.days} events={events} label={`Paydays, bills and card payments from ${shortDate(cal.asOf)}`} />
        <div>
          <BalanceLine cal={cal} />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--flow-in)" }} />Payday</li>
            <li className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--flow-out)" }} />Bill</li>
            <li className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: "var(--warning)" }} />Card payment</li>
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Each charge counts once, on its next date. Cards count their minimum payment. This is a projection, not a promise.</p>
    </Card>
  );
}
