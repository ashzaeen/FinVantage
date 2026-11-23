import Link from "next/link";
import { CircleAlert, Info } from "lucide-react";
import { formatUsd, type AttentionFeed, type HealthScore, type SafeToSpend } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Card } from "@/components/ui/Card";
import { shortDate } from "@/lib/format";

/**
 * The first thing on the Overview: the few things worth a look today, most urgent first. The API
 * ranks them and writes each sentence from the figures, so this only lays them out. Severity is a
 * mark and a word, never colour alone.
 */
export function AttentionStrip({ feed }: { feed: AttentionFeed }) {
  return (
    <Card title="Needs Attention Today" subtitle="Across your accounts, budgets and subscriptions" lift={false} action={feed.items.length > 0 ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">{feed.items.length} {feed.items.length === 1 ? "item" : "items"}</span> : undefined}>
      {feed.items.length === 0 ? (
        <p className="text-sm text-muted">Nothing needs you today. Bills, budgets and subscriptions are all in order.</p>
      ) : (
        <ul className="divide-y divide-line">
          {feed.items.map((item) => (
            <li key={item.id}>
              <Link href={item.href} className="flex min-h-11 items-start gap-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.severity === "action" ? "bg-warning-bg text-warning-text" : "bg-info-bg text-info-text"}`}>
                  {item.severity === "action" ? <CircleAlert size={12} aria-hidden="true" /> : <Info size={12} aria-hidden="true" />}
                  {item.severity === "action" ? "Do Soon" : "Heads Up"}
                </span>
                <span className="min-w-0 flex-1 text-ink">{item.message}</span>
                <span aria-hidden="true" className="shrink-0 font-semibold text-accent-ink">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One line of the sum: a sign, a name and an amount. */
function Part({ sign, label, cents }: { sign: "+" | "−" | "="; label: string; cents: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted"><span aria-hidden="true" className="mr-2 inline-block w-3 text-center font-semibold text-ink-secondary">{sign}</span>{label}</dt>
      <dd className="font-medium tabular-nums text-ink">{formatUsd(cents)}</dd>
    </div>
  );
}

/**
 * One number for what is left to spend this month without missing a bill or a savings target,
 * and the four parts it is made of, so the sum can be checked. A negative figure is not red: it
 * reads "Over by", with the cause in the parts.
 */
export function SafeToSpendCard({ safe }: { safe: SafeToSpend }) {
  const over = safe.safeCents < 0;
  const { parts } = safe;
  return (
    <Card title="Safe to Spend This Month" subtitle={`Through ${shortDate(safe.periodEnd)}`}>
      <p className={`font-poppins text-3xl font-bold tabular-nums ${over ? "text-warning-text" : "text-ink"}`}>
        {over ? "Over by " : ""}{formatUsd(Math.abs(safe.safeCents))}
      </p>
      <p className="mt-1 text-xs text-muted">{over ? "This month is already spoken for. The parts below show why." : "What you could spend and still pay what is due and hit your savings target."}</p>
      <dl className="mt-4 space-y-1.5 border-t border-line pt-3">
        <Part sign="+" label="In checking now" cents={parts.checkingCents} />
        <Part sign="+" label="Income still to arrive" cents={parts.incomeStillDueCents} />
        <Part sign="−" label="Bills and charges still due" cents={parts.billsStillDueCents} />
        <Part sign="−" label="Savings still to set aside" cents={parts.savingsStillNeededCents} />
        <div className="mt-1 border-t border-line pt-1.5"><Part sign="=" label="Safe to spend" cents={safe.safeCents} /></div>
      </dl>
    </Card>
  );
}

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
      <ul className="mt-4 space-y-3">
        {health.parts.map((p, i) => (
          <li key={p.key}>
            <BulletBar
              label={p.label}
              valueText={p.valueText}
              fill={p.score / 100}
              tone={!p.hasData ? "accent" : p.score >= 70 ? "in" : p.score >= 40 ? "accent" : "warn"}
              index={i}
              note={p.hasData ? `${Math.round(p.weight * 100)}% of the score` : "Not enough data yet, so it counts for nothing"}
            />
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
