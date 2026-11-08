import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { PortfolioCharts } from "./PortfolioCharts";

export default async function PortfolioPage() {
  const portfolio = await api.getPortfolio();
  const total = portfolio.holdings.reduce((s, h) => s + h.valueCents, 0);

  return (
    <>
      <PageHeader title="Investments" />
      <div className="grid gap-5 md:grid-cols-2">
        {/* Total value */}
        <Card title="Total Value">
          <MockedBadge />
          <p className="mt-3 text-4xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
            {formatUsd(total)}
          </p>
          <p className="mt-3 text-sm text-[#8d94a8]">Across {portfolio.holdings.length} holdings</p>
        </Card>

        {/* Holdings list */}
        <Card title="Holdings">
          <ul className="space-y-2">
            {portfolio.holdings.map((holding, i) => {
              const pct = total > 0 ? Math.round((holding.valueCents / total) * 100) : 0;
              const colors = ["#5b5fc7", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];
              const color = colors[i % colors.length]!;
              return (
                <li key={holding.symbol}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-3"
                  style={{ background: "var(--surface-inset)" }}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: color + "22", color }}>
                      {holding.symbol.slice(0, 2)}
                    </span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{holding.name}</p>
                      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{holding.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                      {formatUsd(holding.valueCents)}
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{pct}%</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <div className="mt-5"><PortfolioCharts holdings={portfolio.holdings} benchmark={portfolio.benchmark} /></div>
    </>
  );
}
