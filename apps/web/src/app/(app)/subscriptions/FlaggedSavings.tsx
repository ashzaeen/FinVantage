import { formatUsd, type Subscription } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Card } from "@/components/ui/Card";
import { FLAG_LABEL } from "@/lib/subscriptions";

/**
 * What a year costs across the subscriptions that carry a flag worth acting on, one bar each. The
 * total is `flaggedAnnualCents` from the API. FinVantage cancels nothing: this only shows what is
 * at stake if the user chooses to.
 */
export function FlaggedSavings({ items, totalCents }: { items: readonly Subscription[]; totalCents: number }) {
  if (items.length === 0) return null;
  const peak = Math.max(1, ...items.map((item) => item.annualCents ?? 0));
  return (
    <Card title="What Acting on Flags Could Save" subtitle="A year of each flagged subscription, if you chose to stop it">
      <p className="font-poppins text-3xl font-bold tabular-nums text-ink">
        {formatUsd(totalCents)} <span className="text-base font-semibold text-muted">a year</span>
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item, i) => (
          <li key={item.id}>
            <BulletBar
              label={item.merchant}
              valueText={`${formatUsd(item.annualCents ?? 0)} a year`}
              fill={(item.annualCents ?? 0) / peak}
              tone="out"
              index={i}
              note={item.flags.map((f) => FLAG_LABEL[f.type]).join(" · ")}
            />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Only you can cancel anything. This assumes each charge would stop, and it leaves out bills, which can&apos;t simply be dropped.</p>
    </Card>
  );
}
