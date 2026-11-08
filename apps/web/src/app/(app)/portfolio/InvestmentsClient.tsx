"use client";

import { useState, type ReactNode } from "react";
import { ALL_ACCOUNTS_VIEW, formatUsd, type InvestmentsOverview } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { AllocationCard } from "./AllocationCard";
import { HoldingsCard } from "./HoldingsCard";
import { MarketTiles } from "./MarketTiles";
import { PerformanceCard } from "./PerformanceCard";
import { useWatchlist } from "./useWatchlist";
import { WatchlistCard } from "./WatchlistCard";
import { AnimatedNumber, Change, directionClass, Pills, shortDate, signedUsd } from "./parts";

function Tile({ label, value, valueClass = "text-ink", detail, badge, order }: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  detail: ReactNode;
  badge?: ReactNode;
  order: number;
}) {
  return (
    <Card noPad className={`invest-rise invest-rise-${order}`}>
      <div className="px-5 py-4">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p className="text-xs text-muted">{label}</p>
          {badge}
        </div>
        <p className={`font-poppins text-[22px] font-bold leading-8 tabular-nums ${valueClass}`}>{value}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </Card>
  );
}

export function InvestmentsClient({ data }: { data: InvestmentsOverview }) {
  const [viewId, setViewId] = useState(ALL_ACCOUNTS_VIEW);
  const watchlist = useWatchlist(data.watchlistOptions, data.defaultWatchlist);
  const view = data.views.find((candidate) => candidate.id === viewId) ?? data.views[0]!;
  const options = data.views.map((candidate) => ({ value: candidate.id, label: candidate.label }));

  return (
    <>
      <PageHeader title="Investments" action={<Pills options={options} value={view.id} onChange={setViewId} label="Investment Account" />} />

      <div className="-mt-5 mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-inset px-3 py-1 font-semibold text-ink-secondary">
          {data.marketStatus === "open" ? "Market Open" : "Market Closed"}
        </span>
        <span className="text-muted">Sample prices from the {shortDate(data.pricesAsOf)} close. Share counts are demo data.</span>
      </div>

      <main className="space-y-4 pb-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            order={1}
            label="Total Value"
            badge={<MockedBadge />}
            value={<AnimatedNumber value={view.totalValueCents} format={formatUsd} />}
            detail={view.id === ALL_ACCOUNTS_VIEW ? `Across ${view.accountCount} accounts` : `${view.holdings.length} holdings`}
          />
          <Tile
            order={2}
            label="Today's Return"
            valueClass={directionClass(view.dayChangeCents)}
            value={<AnimatedNumber value={view.dayChangeCents} format={signedUsd} />}
            detail={<Change rate={view.dayChangeRate} />}
          />
          <Tile
            order={3}
            label="Total Return"
            valueClass={directionClass(view.totalReturnCents)}
            value={<AnimatedNumber value={view.totalReturnCents} format={signedUsd} />}
            detail={<Change rate={view.totalReturnRate} />}
          />
          <Tile
            order={4}
            label="Cash Available"
            value={<AnimatedNumber value={view.cashCents} format={formatUsd} />}
            detail={`Dividends YTD ${formatUsd(view.dividendsYtdCents)}`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <PerformanceCard view={view} />
          <AllocationCard view={view} />
        </div>

        <HoldingsCard view={view} dates={data.sparklineDates} watchlist={watchlist} />
        <WatchlistCard watchlist={watchlist} dates={data.sparklineDates} />
        <MarketTiles data={data} watchlist={watchlist} />
      </main>
    </>
  );
}
