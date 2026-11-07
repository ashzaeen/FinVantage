import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function PortfolioPage() {
  const portfolio = await api.getPortfolio();

  return (
    <>
      <PageHeader title="Portfolio" tier="P2" prd="4 (#6)" />
      <Card title="Holdings">
        <MockedBadge />
        <ul className="mt-2 text-sm">
          {portfolio.holdings.map((holding) => (
            <li key={holding.symbol} className="flex justify-between py-1">
              {holding.name}
              <span className="tabular-nums">{formatUsd(holding.valueCents)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
