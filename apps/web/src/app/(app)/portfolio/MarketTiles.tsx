"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, type InvestmentsOverview, type MarketQuote, type NewsHeadline } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { WatchToggle, type Watchlist } from "./useWatchlist";
import { Change, Chevron, compactUsd, DetailStat, ExpandPanel, MiniChart, Pills, shortDate } from "./parts";

/* ── Markets ──────────────────────────────────────────────────────────── */

function useOpenRow() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return { openKey, flip: (key: string) => setOpenKey((current) => (current === key ? null : key)) };
}

function MarketsCard({ data }: { data: InvestmentsOverview }) {
  const { openKey, flip } = useOpenRow();
  return (
    <Card title="Markets" action={<MockedBadge />} className="invest-rise invest-rise-5">
      <ul className="-mx-2">
        {data.markets.map((market) => {
          const open = openKey === market.symbol;
          return (
            <li key={market.symbol} className="border-t border-line first:border-t-0">
              <button type="button" aria-expanded={open} onClick={() => flip(market.symbol)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-inset ${open ? "bg-inset" : ""}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <Chevron open={open} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{market.label}</span>
                    <span className="block text-xs text-muted">Tracked by {market.symbol}</span>
                  </span>
                </span>
                <Change rate={market.dayChangeRate} className="text-xs" />
              </button>
              <ExpandPanel open={open}>
                <div className="px-2 pb-3 pt-2">
                  <MiniChart prices={market.sparklineCents} dates={data.sparklineDates} name={market.label} open={open} />
                </div>
              </ExpandPanel>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── Top Movers ───────────────────────────────────────────────────────── */

type MoverFilter = "all" | "gainers" | "losers";

const MOVER_FILTERS: ReadonlyArray<{ value: MoverFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
];

function TopMoversCard({ data, watchlist }: { data: InvestmentsOverview; watchlist: Watchlist }) {
  const [filter, setFilter] = useState<MoverFilter>("all");
  const { openKey, flip } = useOpenRow();
  const movers: MarketQuote[] = filter === "gainers" ? data.topGainers : filter === "losers" ? data.topLosers : data.topMovers;

  return (
    <Card title="Top Movers" action={<MockedBadge />} className="invest-rise invest-rise-5">
      <Pills options={MOVER_FILTERS} value={filter} onChange={setFilter} label="Filter Top Movers" compact />
      {movers.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing moved this way in the last session.</p>}
      <ul key={filter} className="-mx-2 mt-2">
        {movers.map((mover) => {
          const open = openKey === mover.symbol;
          const stats = watchlist.known.get(mover.symbol);
          return (
            <li key={mover.symbol} className="invest-fade border-t border-line first:border-t-0">
              <button type="button" aria-expanded={open} onClick={() => flip(mover.symbol)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-inset ${open ? "bg-inset" : ""}`}>
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <Chevron open={open} />
                  <span className="font-semibold text-ink">{mover.symbol}</span>
                  <span className="truncate text-xs text-muted">{mover.name}</span>
                </span>
                <Change rate={mover.dayChangeRate} className="text-xs" />
              </button>
              <ExpandPanel open={open}>
                <div className="space-y-3 px-2 pb-3 pt-2">
                  <MiniChart prices={mover.sparklineCents} dates={data.sparklineDates} name={mover.name} open={open} />
                  {stats && (
                    <div className="grid grid-cols-2 gap-3">
                      <DetailStat label="52-Week Low">{formatUsd(stats.week52LowCents)}</DetailStat>
                      <DetailStat label="52-Week High">{formatUsd(stats.week52HighCents)}</DetailStat>
                      <DetailStat label="Market Cap">{stats.marketCapCents === null ? "–" : compactUsd(stats.marketCapCents)}</DetailStat>
                      <DetailStat label="P/E">{stats.peRatio === null ? "–" : stats.peRatio.toFixed(1)}</DetailStat>
                    </div>
                  )}
                  <WatchToggle symbol={mover.symbol} watchlist={watchlist} />
                </div>
              </ExpandPanel>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── Market News, and the reader that slides in over the page ──────────── */

function NewsReader({ articles, index, onNavigate, onClose }: {
  articles: NewsHeadline[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const article = articles[index]!;

  useEffect(() => {
    // No cleanup: closing here fires the dialog's close event, which would dismiss the reader.
    // Unmounting removes the dialog anyway.
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [index]);

  const navButton = "rounded-full bg-inset px-3.5 py-1.5 text-xs font-bold text-ink-secondary transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="news-reader-title"
      onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
      className="invest-drawer fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-lg overflow-hidden bg-raised p-0 shadow-[var(--shadow-float)]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <MockedBadge />
          <button type="button" aria-label="Close Article" onClick={onClose} className="h-9 w-9 rounded-full text-muted transition-colors hover:bg-inset hover:text-ink">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div ref={body} key={article.id} className="invest-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          <p className="text-xs font-semibold text-accent">{article.source} · {shortDate(article.publishedOn)}</p>
          <h2 id="news-reader-title" className="mt-2 font-poppins text-2xl font-bold leading-8 text-ink">{article.title}</h2>
          <div className="mt-4 space-y-4 text-[15px] leading-7 text-ink-secondary">
            {article.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {article.url ? (
            <a href={article.url} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--accent-hover)]">
              Read at Source
            </a>
          ) : (
            <p className="mt-6 rounded-xl bg-inset p-3 text-xs leading-5 text-muted">This is a sample article written for the demo. Live stories will open from their original source.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <button type="button" className={navButton} disabled={index === 0} onClick={() => onNavigate(index - 1)}>Previous</button>
          <span className="text-xs tabular-nums text-muted">{index + 1} of {articles.length}</span>
          <button type="button" className={navButton} disabled={index === articles.length - 1} onClick={() => onNavigate(index + 1)}>Next</button>
        </div>
      </div>
    </dialog>
  );
}

function NewsCard({ news }: { news: NewsHeadline[] }) {
  const [reading, setReading] = useState<number | null>(null);
  return (
    <Card title="Market News" action={<MockedBadge />} className="invest-rise invest-rise-5">
      <ul className="-mx-2">
        {news.map((headline, index) => (
          <li key={headline.id} className="border-t border-line first:border-t-0">
            <button type="button" onClick={() => setReading(index)} className="group flex w-full items-start justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-inset">
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-5 text-ink transition-colors group-hover:text-accent">{headline.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{headline.source} · {shortDate(headline.publishedOn)}</span>
              </span>
              <span aria-hidden="true" className="mt-0.5 text-sm text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none">→</span>
            </button>
          </li>
        ))}
      </ul>
      {reading !== null && <NewsReader articles={news} index={reading} onNavigate={setReading} onClose={() => setReading(null)} />}
    </Card>
  );
}

export function MarketTiles({ data, watchlist }: { data: InvestmentsOverview; watchlist: Watchlist }) {
  return (
    <section aria-label="Market Overview" className="grid gap-5 md:grid-cols-3">
      <MarketsCard data={data} />
      <TopMoversCard data={data} watchlist={watchlist} />
      <NewsCard news={data.news} />
    </section>
  );
}
