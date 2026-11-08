"use client";

import { Fragment, useState } from "react";
import { ALL_ACCOUNTS_VIEW, formatUsd, type InvestmentHolding, type InvestmentView } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { WatchToggle, type Watchlist } from "./useWatchlist";
import { Change, Chevron, DetailStat, directionClass, ExpandPanel, MiniChart, percent, signedUsd, SortHeader, useSortedRows } from "./parts";

const COLUMNS = {
  symbol: (h: InvestmentHolding) => h.symbol,
  price: (h: InvestmentHolding) => h.priceCents,
  today: (h: InvestmentHolding) => h.dayChangeRate,
  shares: (h: InvestmentHolding) => h.quantity,
  avgCost: (h: InvestmentHolding) => h.avgCostCents,
  value: (h: InvestmentHolding) => h.valueCents,
  totalReturn: (h: InvestmentHolding) => h.totalReturnRate,
  share: (h: InvestmentHolding) => h.shareOfView,
};

const shares = (quantity: number) => quantity.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function HoldingsCard({ view, dates, watchlist }: { view: InvestmentView; dates: string[]; watchlist: Watchlist }) {
  const { sorted, sort, toggle } = useSortedRows(view.holdings, COLUMNS, { key: "value", desc: true });
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const flip = (symbol: string) => setOpenSymbol((current) => (current === symbol ? null : symbol));

  return (
    <Card title="Holdings" subtitle={view.id === ALL_ACCOUNTS_VIEW ? "Combined across your investment accounts. Select a row for details." : `Held in ${view.label}. Select a row for details.`} className="invest-rise invest-rise-5">
      {view.holdings.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No holdings in this account yet.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-right text-[11px] text-muted">
                <SortHeader label="Symbol" column="symbol" sort={sort} onSort={toggle} className="pl-2 text-left" />
                <SortHeader label="Price" column="price" sort={sort} onSort={toggle} />
                <SortHeader label="Today" column="today" sort={sort} onSort={toggle} />
                <SortHeader label="Shares" column="shares" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                <SortHeader label="Avg Cost" column="avgCost" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                <SortHeader label="Value" column="value" sort={sort} onSort={toggle} />
                <SortHeader label="Total Return" column="totalReturn" sort={sort} onSort={toggle} className="hidden sm:table-cell" />
                <SortHeader label="Share" column="share" sort={sort} onSort={toggle} className="hidden pr-2 md:table-cell" />
              </tr>
            </thead>
            <tbody key={view.id}>
              {sorted.map((holding) => {
                const open = openSymbol === holding.symbol;
                return (
                  <Fragment key={holding.symbol}>
                    <tr onClick={() => flip(holding.symbol)} className={`invest-fade cursor-pointer border-t border-line text-right transition-colors hover:bg-inset ${open ? "bg-inset" : ""}`}>
                      <td className="py-2.5 pl-2 text-left">
                        <button type="button" aria-expanded={open} onClick={(event) => { event.stopPropagation(); flip(holding.symbol); }} className="inline-flex items-center gap-2">
                          <Chevron open={open} />
                          <span className="font-semibold text-ink">{holding.symbol}</span>
                        </button>
                        <span className="ml-2 hidden text-xs text-muted lg:inline">{holding.name}</span>
                      </td>
                      <td className="py-2.5 text-ink">{formatUsd(holding.priceCents)}</td>
                      <td className="py-2.5"><Change rate={holding.dayChangeRate} className="text-xs" /></td>
                      <td className="hidden py-2.5 text-ink-secondary md:table-cell">{shares(holding.quantity)}</td>
                      <td className="hidden py-2.5 text-ink-secondary md:table-cell">{formatUsd(holding.avgCostCents)}</td>
                      <td className="py-2.5 font-semibold text-ink">{formatUsd(holding.valueCents)}</td>
                      <td className="hidden py-2.5 sm:table-cell"><Change rate={holding.totalReturnRate} className="text-xs" /></td>
                      <td className="hidden py-2.5 pr-2 text-ink-secondary md:table-cell">{percent(holding.shareOfView)}</td>
                    </tr>
                    <tr>
                      <td colSpan={8} className="p-0">
                        <ExpandPanel open={open}>
                          <div className="grid gap-5 px-2 pb-4 pt-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                            <MiniChart prices={holding.sparklineCents} dates={dates} name={holding.name} open={open} />
                            <div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                                <DetailStat label="Today's Gain"><span className={directionClass(holding.dayChangeCents)}>{signedUsd(holding.dayChangeCents)}</span></DetailStat>
                                <DetailStat label="Total Return"><span className={directionClass(holding.totalReturnCents)}>{signedUsd(holding.totalReturnCents)}</span></DetailStat>
                                <DetailStat label="Cost Basis">{formatUsd(holding.costBasisCents)}</DetailStat>
                                <DetailStat label="Shares">{shares(holding.quantity)}</DetailStat>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-muted">
                                  {holding.accounts.map((account) => `${account.label}: ${shares(account.quantity)} (${formatUsd(account.valueCents)})`).join(" · ")}
                                </p>
                                <WatchToggle symbol={holding.symbol} watchlist={watchlist} />
                              </div>
                            </div>
                          </div>
                        </ExpandPanel>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
