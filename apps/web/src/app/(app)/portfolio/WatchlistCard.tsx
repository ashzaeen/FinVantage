"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { formatUsd, type WatchlistItem } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import type { Watchlist } from "./useWatchlist";
import { Change, Chevron, compactUsd, DetailStat, ExpandPanel, MiniChart, SortHeader, Sparkline, useSortedRows } from "./parts";

const COLUMNS = {
  symbol: (w: WatchlistItem) => w.symbol,
  price: (w: WatchlistItem) => w.priceCents,
  today: (w: WatchlistItem) => w.dayChangeRate,
  marketCap: (w: WatchlistItem) => w.marketCapCents ?? -1,
  pe: (w: WatchlistItem) => w.peRatio ?? -1,
};

function RangeBar({ item }: { item: WatchlistItem }) {
  const span = item.week52HighCents - item.week52LowCents;
  const position = span > 0 ? Math.min(100, Math.max(0, ((item.priceCents - item.week52LowCents) / span) * 100)) : 50;
  const description = `${formatUsd(item.week52LowCents)} to ${formatUsd(item.week52HighCents)}`;
  return (
    <span className="relative ml-auto block h-1 w-24 rounded-full bg-line" title={description}>
      <span className="sr-only">{description}</span>
      <i aria-hidden="true" className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-raised bg-accent" style={{ left: `${position}%` }} />
    </span>
  );
}

function AddSymbol({ options, onAdd }: { options: WatchlistItem[]; onAdd: (symbol: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const search = query.trim().toLowerCase();
  const matches = options.filter((o) => o.symbol.toLowerCase().includes(search) || o.name.toLowerCase().includes(search));

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); setQuery(""); }}
        className="rounded-full bg-accent-soft px-3.5 py-1.5 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-white"
      >
        + Add Symbol
      </button>
      {open && (
        <div className="invest-fade absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-4rem)] rounded-2xl border border-line bg-raised p-2 shadow-[var(--shadow-float)]">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by symbol or name"
            aria-label="Search Symbols"
            className="w-full rounded-xl bg-inset px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
          />
          <ul className="no-scrollbar mt-1 max-h-56 overflow-y-auto">
            {matches.length === 0 && <li className="px-3 py-3 text-center text-xs text-muted">No matching symbols.</li>}
            {matches.map((option) => (
              <li key={option.symbol}>
                <button
                  type="button"
                  onClick={() => { onAdd(option.symbol); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-inset"
                >
                  <span className="font-semibold text-ink">{option.symbol}</span>
                  <span className="truncate text-xs text-muted">{option.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function WatchlistCard({ watchlist, dates }: { watchlist: Watchlist; dates: string[] }) {
  const { sorted, sort, toggle } = useSortedRows(watchlist.items, COLUMNS, { key: "symbol", desc: false });
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  const flip = (symbol: string) => setOpenSymbol((current) => (current === symbol ? null : symbol));

  return (
    <Card
      title="Watchlist"
      subtitle="Symbols you want to keep an eye on"
      className="invest-rise invest-rise-5 relative z-10"
      action={<div className="flex items-center gap-2"><span className="hidden sm:inline"><MockedBadge /></span><AddSymbol options={watchlist.available} onAdd={watchlist.add} /></div>}
    >
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Your Watchlist is empty. Add a symbol to start following it.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-right text-[11px] text-muted">
                <SortHeader label="Symbol" column="symbol" sort={sort} onSort={toggle} className="pl-2 text-left" />
                <th className="hidden pb-2 font-medium lg:table-cell">Past Month</th>
                <SortHeader label="Price" column="price" sort={sort} onSort={toggle} />
                <SortHeader label="Today" column="today" sort={sort} onSort={toggle} />
                <th className="hidden pb-2 font-medium sm:table-cell">52-Week Range</th>
                <SortHeader label="Market Cap" column="marketCap" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                <SortHeader label="P/E" column="pe" sort={sort} onSort={toggle} className="hidden md:table-cell" />
                <th className="pb-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const open = openSymbol === item.symbol;
                return (
                  <Fragment key={item.symbol}>
                    <tr onClick={() => flip(item.symbol)} className={`invest-fade cursor-pointer border-t border-line text-right transition-colors hover:bg-inset ${open ? "bg-inset" : ""}`}>
                      <td className="py-2 pl-2 text-left">
                        <button type="button" aria-expanded={open} onClick={(event) => { event.stopPropagation(); flip(item.symbol); }} className="inline-flex items-center gap-2">
                          <Chevron open={open} />
                          <span className="font-semibold text-ink">{item.symbol}</span>
                        </button>
                        <span className="ml-2 hidden text-xs text-muted sm:inline">{item.name}</span>
                      </td>
                      <td className="hidden py-2 lg:table-cell"><Sparkline prices={item.sparklineCents} /></td>
                      <td className="py-2 text-ink">{formatUsd(item.priceCents)}</td>
                      <td className="py-2"><Change rate={item.dayChangeRate} className="text-xs" /></td>
                      <td className="hidden py-2 sm:table-cell"><RangeBar item={item} /></td>
                      <td className="hidden py-2 text-ink-secondary md:table-cell">{item.marketCapCents === null ? "–" : compactUsd(item.marketCapCents)}</td>
                      <td className="hidden py-2 text-ink-secondary md:table-cell">{item.peRatio === null ? "–" : item.peRatio.toFixed(1)}</td>
                      <td className="py-1 pl-1">
                        <button
                          type="button"
                          aria-label={`Remove ${item.symbol} From Watchlist`}
                          onClick={(event) => { event.stopPropagation(); watchlist.remove(item.symbol); }}
                          className="h-8 w-8 rounded-full text-muted transition-colors hover:bg-critical-bg hover:text-loss"
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={8} className="p-0">
                        <ExpandPanel open={open}>
                          <div className="grid gap-5 px-2 pb-4 pt-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                            <MiniChart prices={item.sparklineCents} dates={dates} name={item.name} open={open} />
                            <div className="grid content-center grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                              <DetailStat label="52-Week Low">{formatUsd(item.week52LowCents)}</DetailStat>
                              <DetailStat label="52-Week High">{formatUsd(item.week52HighCents)}</DetailStat>
                              <DetailStat label="Market Cap">{item.marketCapCents === null ? "–" : compactUsd(item.marketCapCents)}</DetailStat>
                              <DetailStat label="P/E">{item.peRatio === null ? "–" : item.peRatio.toFixed(1)}</DetailStat>
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
