import { formatUsd, type NetWorth } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { Card } from "@/components/ui/Card";

/**
 * How reachable the assets are: cash today, a brokerage account that takes a few days to sell and
 * settle, and money locked in CDs and retirement accounts. Net worth hides the difference. The
 * figures come from `NetWorth.liquidity`; the bars are scaled to the biggest of the three.
 */
export function LiquidityLadder({ netWorth }: { netWorth: NetWorth }) {
  const { cashCents, sellableCents, lockedCents } = netWorth.liquidity;
  const peak = Math.max(1, cashCents, sellableCents, lockedCents);
  const rows = [
    { label: "Cash Today", detail: "Checking and savings", cents: cashCents, tone: "in" as const },
    { label: "Within a Few Days", detail: "Brokerage: sell, then wait to settle", cents: sellableCents, tone: "accent" as const },
    { label: "Locked Up", detail: "CDs and retirement accounts, which can cost a penalty to open early", cents: lockedCents, tone: "warn" as const },
  ];
  if (cashCents + sellableCents + lockedCents === 0) return null;
  return (
    <Card title="How Reachable Is Your Money" subtitle="Your assets by how quickly you could use them">
      <ul className="space-y-4">
        {rows.map((row, i) => (
          <li key={row.label}>
            <BulletBar label={row.label} valueText={formatUsd(row.cents)} fill={row.cents / peak} tone={row.tone} note={row.detail} index={i} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
