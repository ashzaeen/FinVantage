import Link from "next/link";
import { formatUsd, type HealthScore, type SafeToSpend } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { StackedBar } from "@/components/charts/StackedBar";
import { Card } from "@/components/ui/Card";
import { shortDate } from "@/lib/format";

/**
 * One number for what is left to spend this month without missing a bill or a savings target,
 * and the four parts it is made of, so the sum can be checked. A negative figure is not red: it
 * reads "Over by", with the cause in the parts.
 */
export function SafeToSpendCard({ safe, nextPayday }: { safe: SafeToSpend; nextPayday?: string | null }) {
  const over = safe.safeCents < 0;
  const { parts } = safe;
  const available = parts.checkingCents + parts.incomeStillDueCents;
  const segments = [
    { label: "Bills and charges still due", cents: parts.billsStillDueCents, color: "var(--flow-out)" },
    { label: "Savings still to set aside", cents: parts.savingsStillNeededCents, color: "var(--series-3)" },
    { label: "Safe to spend", cents: Math.max(0, safe.safeCents), color: "var(--series-1)" },
  ];
  return (
    <Card title="Safe to Spend This Month" subtitle={`Through ${shortDate(safe.periodEnd)}`}>
      <p className={`font-poppins text-3xl font-bold tabular-nums ${over ? "text-warning-text" : "text-ink"}`}>
        {over ? "Over by " : ""}{formatUsd(Math.abs(safe.safeCents))}
      </p>
      <p className="mt-1 text-xs text-muted">{over ? "This month is already spoken for. Bills and savings come to more than you have." : "What you could spend and still pay what is due and hit your savings target."}</p>
      <div className="mt-4">
        <StackedBar segments={segments} label="Where this month's money goes" />
      </div>
      <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
        {formatUsd(available)} to work with: {formatUsd(parts.checkingCents)} in checking now plus {formatUsd(parts.incomeStillDueCents)} of income still to arrive.
        {nextPayday ? ` Next payday: ${shortDate(nextPayday)}.` : ""}
      </p>
    </Card>
  );
}

/** Where each part of the score lives in full. */
const PART_HREF: Record<HealthScore["parts"][number]["key"], string> = {
  savings_rate: "/income",
  debt_to_income: "/income",
  utilization: "/credit",
  runway: "/accounts",
};

/** A half ring for the score, drawn with a stroke length. The number is in the middle. */
function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const arc = Math.PI * radius;
  return (
    <svg viewBox="0 0 140 80" className="mx-auto w-40" role="img" aria-label={`Score ${score} out of 100`}>
      <path d="M16 70 A54 54 0 0 1 124 70" fill="none" stroke="var(--surface-inset)" strokeWidth="12" strokeLinecap="round" />
      <path d="M16 70 A54 54 0 0 1 124 70" fill="none" stroke="var(--series-1)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(score / 100) * arc} ${arc}`} className="meter-fill" />
      <text x="70" y="62" textAnchor="middle" className="fill-ink font-poppins" fontSize="28" fontWeight="700">{score}</text>
    </svg>
  );
}

/**
 * One score from four parts, with each part and its weight visible, and the formula one tap away.
 * Every figure is worked out in the API. It is a way to track progress, not a credit score.
 */
export function HealthScoreCard({ health }: { health: HealthScore }) {
  return (
    <Card title="Financial Health" subtitle="Four things that move together">
      <ScoreRing score={health.score} />
      <p className="mt-1 text-center text-sm font-semibold text-ink">{health.label}</p>
      <ul className="mt-4 space-y-1">
        {health.parts.map((p, i) => (
          <li key={p.key}>
            <Link href={PART_HREF[p.key]} className="-mx-2 block min-h-11 rounded-lg px-2 py-1.5 hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
            <BulletBar
              label={p.label}
              valueText={p.valueText}
              fill={p.score / 100}
              tone={!p.hasData ? "accent" : p.score >= 70 ? "in" : p.score >= 40 ? "accent" : "warn"}
              index={i}
              note={p.hasData ? `${Math.round(p.weight * 100)}% of the score` : "Not enough data yet, so it counts for nothing"}
            />
            </Link>
          </li>
        ))}
      </ul>
      <details className="mt-4 text-xs text-muted">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-accent-ink">How This Is Worked Out</summary>
        <p>Each part is scored from 0 to 100 along a simple curve, then weighted: savings rate 30%, debt-to-income 25%, cash runway 25% and card utilization 20%. A part with no data drops out and the others share its weight. A rate of 20% saved, debt under 15% of income, cards under 10% used and six months of cash each earn the full 100. This is a progress measure for you, not a credit score.</p>
      </details>
    </Card>
  );
}
