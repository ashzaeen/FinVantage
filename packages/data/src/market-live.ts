/**
 * Live market data for the Investments page: Alpaca for prices, history, dividends and news (the
 * free IEX feed), and Financial Modeling Prep for market cap and P/E. Keys stay on the server.
 *
 * The page never goes blank: if a refresh fails it keeps the last good snapshot, and with none
 * it shows the sample data, which says so on the page. Snapshots are cached for a minute while the
 * market is open and ten minutes while it is closed. History, dividends and fundamentals change
 * at most daily, so they are cached longer; FMP's free plan allows 250 calls a day.
 *
 * Assumptions:
 * - The symbols are the sample list in `market.ts`, so share counts in the demo profile still apply.
 * - Chart dates are the S&P 500 ETF's trading days. Crypto trades every day, so its points use the
 *   close on those dates, and its latest point is its current price.
 * - Open or closed comes from the clock in New York. Market holidays read as open.
 */
import type { InvestmentRange, MarketSecurity, MarketSeries, MarketSnapshot, NewsHeadline } from "@finvantage/contracts";
import {
  dailyRanges,
  DEFAULT_WATCHLIST,
  INDEXES,
  MARKET_SYMBOLS,
  marketStatusAt,
  ONE_DAY_TIMES,
  ONE_WEEK_TIMES,
  SampleMarketData,
  type MarketDataProvider,
} from "./market";

const ALPACA = "https://data.alpaca.markets";
const FMP = "https://financialmodelingprep.com/stable";
const BENCHMARK = "SPY";
const HISTORY_DAYS = 3 * 365 + 7;
const INTRADAY_DAYS = 14;
const WEEK_52_SESSIONS = 252;
const BAR_MINUTES = 15;
const NEWS_COUNT = 5;
const MAX_PARAGRAPHS = 6;
const OPEN_TTL_MS = 60_000;
const CLOSED_TTL_MS = 10 * 60_000;
const HISTORY_TTL_MS = 6 * 60 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;

type Fetch = typeof fetch;

export interface LiveMarketOptions {
  alpacaKeyId: string;
  alpacaSecretKey: string;
  /** Without it, market cap and P/E are empty. */
  fmpApiKey?: string | null;
  fetch?: Fetch;
  /** Used only when no live snapshot has ever loaded. */
  fallback?: MarketDataProvider;
  timeoutMs?: number;
  /** Where refresh failures are reported. */
  warn?: (message: string) => void;
}

interface AlpacaBar {
  t: string;
  c: number;
}
interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
}
interface AlpacaNews {
  id: number;
  headline: string;
  source: string;
  created_at: string;
  summary: string;
  content: string;
  url: string;
}

interface History {
  /** Benchmark trading days, oldest first. */
  dates: string[];
  /** Daily closes in cents by symbol, keyed by date. */
  closes: Record<string, Map<string, number>>;
}
interface Fundamentals {
  marketCapCents: number | null;
  peRatio: number | null;
}
interface Timed<T> {
  key: string;
  at: number;
  value: T;
}

const isCrypto = (symbol: string) => MARKET_SYMBOLS.find((s) => s.symbol === symbol)?.assetClass === "crypto";
const STOCKS = MARKET_SYMBOLS.filter((s) => s.assetClass !== "crypto").map((s) => s.symbol);
const CRYPTO = MARKET_SYMBOLS.filter((s) => s.assetClass === "crypto").map((s) => s.symbol);
const alpacaPair = (symbol: string) => `${symbol}/USD`;
const cents = (dollars: number) => Math.round(dollars * 100);

/* ── New York time ───────────────────────────────────────────────────── */

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function nyWall(ms: number): { date: string; time: string; asUtc: number } {
  const part = (type: string) => NY_PARTS.formatToParts(new Date(ms)).find((p) => p.type === type)?.value ?? "00";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}`;
  return { date, time, asUtc: Date.parse(`${date}T${time}:00Z`) };
}

/** The instant of a New York wall-clock time, daylight saving included. */
export function nyInstant(date: string, time: string): number {
  const wanted = Date.parse(`${date}T${time}:00Z`);
  let ms = wanted + 5 * 3_600_000;
  for (let i = 0; i < 2; i += 1) ms += wanted - nyWall(ms).asUtc;
  return ms;
}

const nyDate = (iso: string) => nyWall(Date.parse(iso)).date;

/* ── Shaping ─────────────────────────────────────────────────────────── */

/** Closes on each date, carrying the last known close forward and the first one back. */
function aligned(dates: string[], closes: Map<string, number>): number[] {
  const known = [...closes.entries()].sort(([a], [b]) => a.localeCompare(b));
  const out: number[] = [];
  let index = 0;
  let current = known[0]?.[1] ?? 0;
  for (const date of dates) {
    while (index < known.length && known[index]![0] <= date) current = known[index++]![1];
    out.push(current);
  }
  return out;
}

/** The close of the last bar that finished by `at`, or undefined. Bars are sorted by end time. */
function closeBy(bars: Array<{ end: number; cents: number }>, at: number): number | undefined {
  let low = 0;
  let high = bars.length - 1;
  let found: number | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (bars[mid]!.end <= at) {
      found = bars[mid]!.cents;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

/** Points up to now on a day that is still trading; every point on earlier days. */
function upTo(labels: string[], nowMs: number): string[] {
  const kept = labels.filter((label) => nyInstant(label.slice(0, 10), label.slice(11)) <= nowMs);
  return kept.length > 0 ? kept : labels.slice(0, 1);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Story HTML as plain paragraphs. */
export function paragraphs(html: string): string[] {
  return html
    .split(/<\/p>|<br\s*\/?>|<\/h\d>|<\/li>/i)
    .map((chunk) => decode(chunk.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0);
}

function validUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/* ── Provider ────────────────────────────────────────────────────────── */

export class LiveMarketData implements MarketDataProvider {
  private readonly fetch: Fetch;
  private readonly fallback: MarketDataProvider;
  private readonly timeoutMs: number;
  private readonly warn: (message: string) => void;
  private last: { at: number; snapshot: MarketSnapshot } | null = null;
  private failedAt = Number.NEGATIVE_INFINITY;
  private pending: Promise<MarketSnapshot> | null = null;
  /** History, fundamentals and dividends, which change at most daily. */
  private readonly slow = new Map<string, Timed<unknown>>();

  constructor(private readonly options: LiveMarketOptions) {
    this.fetch = options.fetch ?? fetch;
    this.fallback = options.fallback ?? new SampleMarketData();
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.warn = options.warn ?? ((message) => console.warn(message));
  }

  async snapshot(input: { today: string; now: string }): Promise<MarketSnapshot> {
    const nowMs = Date.parse(input.now);
    const last = this.last;
    if (last) {
      const ttl = last.snapshot.marketStatus === "open" ? OPEN_TTL_MS : CLOSED_TTL_MS;
      if (nowMs - last.at < ttl) return last.snapshot;
    }
    if (nowMs - this.failedAt < RETRY_AFTER_FAILURE_MS) return last?.snapshot ?? this.fallback.snapshot(input);

    this.pending ??= this.load(input.today, input.now).finally(() => {
      this.pending = null;
    });
    try {
      const snapshot = await this.pending;
      this.last = { at: nowMs, snapshot };
      return snapshot;
    } catch (error) {
      this.failedAt = nowMs;
      const reason = error instanceof Error ? error.message : String(error);
      this.warn(`Market feed failed (${reason}). Showing ${last ? "the last good prices" : "sample prices"}.`);
      return last?.snapshot ?? this.fallback.snapshot(input);
    }
  }

  private async get<T>(url: string, headers: Record<string, string>): Promise<T> {
    const response = await this.fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    // The URL is left out because FMP's key travels in it.
    if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status}`);
    return (await response.json()) as T;
  }

  private alpaca<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams(params).toString();
    return this.get<T>(`${ALPACA}${path}?${query}`, {
      "APCA-API-KEY-ID": this.options.alpacaKeyId,
      "APCA-API-SECRET-KEY": this.options.alpacaSecretKey,
    });
  }

  /** Every page of a bars request, by symbol. */
  private async bars(path: string, params: Record<string, string>): Promise<Record<string, AlpacaBar[]>> {
    const all: Record<string, AlpacaBar[]> = {};
    let pageToken: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const body: { bars: Record<string, AlpacaBar[]> | null; next_page_token?: string | null } = await this.alpaca(path, {
        ...params,
        limit: "10000",
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      for (const [symbol, list] of Object.entries(body.bars ?? {})) (all[symbol] ??= []).push(...list);
      pageToken = body.next_page_token ?? null;
      if (!pageToken) break;
    }
    return all;
  }

  private async loadHistory(today: string): Promise<History> {
    const start = new Date(Date.parse(`${today}T00:00:00Z`) - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [stocks, crypto] = await Promise.all([
      this.bars("/v2/stocks/bars", { symbols: STOCKS.join(","), timeframe: "1Day", start, feed: "iex", adjustment: "split" }),
      this.bars("/v1beta3/crypto/us/bars", { symbols: CRYPTO.map(alpacaPair).join(","), timeframe: "1Day", start }),
    ]);
    const closes: Record<string, Map<string, number>> = {};
    for (const symbol of STOCKS) closes[symbol] = new Map((stocks[symbol] ?? []).map((bar) => [nyDate(bar.t), cents(bar.c)]));
    for (const symbol of CRYPTO) closes[symbol] = new Map((crypto[alpacaPair(symbol)] ?? []).map((bar) => [bar.t.slice(0, 10), cents(bar.c)]));
    const dates = [...(closes[BENCHMARK]?.keys() ?? [])].sort();
    if (dates.length < 2) throw new Error("no benchmark history");
    return { dates, closes };
  }

  private async loadFundamentals(): Promise<Record<string, Fundamentals>> {
    const key = this.options.fmpApiKey;
    if (!key) return {};
    const wanted = MARKET_SYMBOLS.filter((s) => !s.fund);
    const results = await Promise.allSettled(
      wanted.map(async ({ symbol, assetClass }): Promise<[string, Fundamentals]> => {
        if (assetClass === "crypto") {
          const [quote] = await this.get<Array<{ marketCap?: number }>>(`${FMP}/quote?symbol=${symbol}USD&apikey=${key}`, {});
          return [symbol, { marketCapCents: quote?.marketCap ? cents(quote.marketCap) : null, peRatio: null }];
        }
        const [metrics] = await this.get<Array<{ marketCap?: number; earningsYieldTTM?: number }>>(
          `${FMP}/key-metrics-ttm?symbol=${symbol}&apikey=${key}`,
          {},
        );
        const earningsYield = metrics?.earningsYieldTTM ?? 0;
        return [
          symbol,
          {
            marketCapCents: metrics?.marketCap ? cents(metrics.marketCap) : null,
            peRatio: earningsYield > 0 ? Math.round(10 / earningsYield) / 10 : null,
          },
        ];
      }),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) this.warn(`FMP fundamentals failed for ${failed} of ${wanted.length} symbols.`);
    return Object.fromEntries(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
  }

  /** Cash dividends per share with an ex-date this year, in cents. */
  private async loadDividends(today: string): Promise<Record<string, number>> {
    const totals: Record<string, number> = {};
    let pageToken: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const body: {
        corporate_actions?: { cash_dividends?: Array<{ symbol: string; rate: number; ex_date: string }> };
        next_page_token?: string | null;
      } = await this.alpaca("/v1/corporate-actions", {
        symbols: STOCKS.join(","),
        types: "cash_dividend",
        start: `${today.slice(0, 4)}-01-01`,
        end: today,
        limit: "1000",
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      for (const dividend of body.corporate_actions?.cash_dividends ?? []) {
        totals[dividend.symbol] = (totals[dividend.symbol] ?? 0) + dividend.rate * 100;
      }
      pageToken = body.next_page_token ?? null;
      if (!pageToken) break;
    }
    return Object.fromEntries(Object.entries(totals).map(([symbol, value]) => [symbol, Math.round(value)]));
  }

  private async loadNews(): Promise<NewsHeadline[]> {
    const body = await this.alpaca<{ news: AlpacaNews[] }>("/v1beta1/news", {
      symbols: STOCKS.join(","),
      limit: "20",
      include_content: "true",
      exclude_contentless: "true",
    });
    return body.news
      .map((story): NewsHeadline | null => {
        const content = paragraphs(story.content);
        const text = (content.length > 0 ? content : paragraphs(story.summary)).slice(0, MAX_PARAGRAPHS);
        if (text.length === 0) return null;
        return {
          id: `alpaca-${story.id}`,
          title: decode(story.headline).trim(),
          source: story.source ? story.source[0]!.toUpperCase() + story.source.slice(1) : "Alpaca",
          publishedOn: nyDate(story.created_at),
          body: text,
          url: validUrl(story.url),
        };
      })
      .filter((story): story is NewsHeadline => story !== null)
      .slice(0, NEWS_COUNT);
  }

  /** Reuses a cached value while it is fresh, and the stale one if a refresh fails. */
  private async cachedOr<T>(slot: string, key: string, nowMs: number, ttl: number, load: () => Promise<T>, empty?: T): Promise<T> {
    const current = this.slow.get(slot) as Timed<T> | undefined;
    if (current && current.key === key && nowMs - current.at < ttl) return current.value;
    try {
      const value = await load();
      this.slow.set(slot, { key, at: nowMs, value });
      return value;
    } catch (error) {
      if (empty === undefined) throw error;
      this.warn(`Market ${slot} failed (${error instanceof Error ? error.message : String(error)}).`);
      return current?.value ?? empty;
    }
  }

  private async load(today: string, now: string): Promise<MarketSnapshot> {
    const nowMs = Date.parse(now);
    const intradayStart = new Date(nowMs - INTRADAY_DAYS * 86_400_000).toISOString();
    const [history, fundamentals, dividends, stockSnaps, cryptoSnaps, stockBars, cryptoBars, news] = await Promise.all([
      this.cachedOr("history", today, nowMs, HISTORY_TTL_MS, () => this.loadHistory(today)),
      this.cachedOr("fundamentals", today, nowMs, Number.POSITIVE_INFINITY, () => this.loadFundamentals(), {}),
      this.cachedOr("dividends", today, nowMs, Number.POSITIVE_INFINITY, () => this.loadDividends(today), {}),
      this.alpaca<Record<string, AlpacaSnapshot>>("/v2/stocks/snapshots", { symbols: STOCKS.join(","), feed: "iex" }),
      this.alpaca<{ snapshots: Record<string, AlpacaSnapshot> }>("/v1beta3/crypto/us/snapshots", { symbols: CRYPTO.map(alpacaPair).join(",") }),
      this.bars("/v2/stocks/bars", { symbols: STOCKS.join(","), timeframe: `${BAR_MINUTES}Min`, start: intradayStart, feed: "iex" }),
      this.bars("/v1beta3/crypto/us/bars", { symbols: CRYPTO.map(alpacaPair).join(","), timeframe: `${BAR_MINUTES}Min`, start: intradayStart }),
      this.loadNews().catch((error: unknown) => {
        this.warn(`Market news failed (${error instanceof Error ? error.message : String(error)}).`);
        return this.last?.snapshot.news ?? [];
      }),
    ]);

    const marketStatus = marketStatusAt(now);
    const snaps: Record<string, AlpacaSnapshot | undefined> = { ...stockSnaps };
    for (const symbol of CRYPTO) snaps[symbol] = cryptoSnaps.snapshots[alpacaPair(symbol)];
    const benchmarkDay = snaps[BENCHMARK]?.dailyBar;
    if (!benchmarkDay) throw new Error("no benchmark quote");
    const pricesAsOf = nyDate(benchmarkDay.t);

    // Today's price and the previous close for every symbol the feed answered for.
    const quotes = new Map<string, { price: number; previous: number }>();
    for (const { symbol } of MARKET_SYMBOLS) {
      const snap = snaps[symbol];
      const day = snap?.dailyBar;
      const live = isCrypto(symbol) || marketStatus === "open" ? snap?.latestTrade?.p : undefined;
      const price = live ?? day?.c;
      const previous = snap?.prevDailyBar?.c ?? price;
      if (price !== undefined && previous !== undefined && history.closes[symbol]?.size) quotes.set(symbol, { price: cents(price), previous: cents(previous) });
    }

    const dates = history.dates.filter((date) => date < pricesAsOf).concat(pricesAsOf);
    const daily: Record<string, number[]> = {};
    for (const [symbol, quote] of quotes) {
      const path = aligned(dates, history.closes[symbol]!);
      path[path.length - 1] = quote.price;
      daily[symbol] = path;
    }

    const intraday: Record<string, Array<{ end: number; cents: number }>> = {};
    for (const symbol of quotes.keys()) {
      const bars = isCrypto(symbol) ? cryptoBars[alpacaPair(symbol)] : stockBars[symbol];
      intraday[symbol] = (bars ?? [])
        .map((bar) => ({ end: Date.parse(bar.t) + BAR_MINUTES * 60_000, cents: cents(bar.c) }))
        .sort((a, b) => a.end - b.end);
    }

    const intradaySeries = (labels: string[], first: (symbol: string) => number): MarketSeries => ({
      labels,
      pricesCents: Object.fromEntries(
        [...quotes].map(([symbol, quote]) => {
          const points: number[] = [];
          labels.forEach((label, i) => {
            const at = nyInstant(label.slice(0, 10), label.slice(11));
            points.push(i === 0 ? first(symbol) : (closeBy(intraday[symbol]!, at) ?? points[i - 1]!));
          });
          points[points.length - 1] = quote.price;
          return [symbol, points];
        }),
      ),
    });

    const last = dates.length - 1;
    const week = dates.slice(-5);
    const weekStart = dates[Math.max(0, last - 5)]!;
    const oneDay = intradaySeries(
      upTo(ONE_DAY_TIMES.map((time) => `${pricesAsOf}T${time}`), nowMs),
      (symbol) => quotes.get(symbol)!.previous,
    );
    const oneWeek = intradaySeries(
      [`${weekStart}T16:00`, ...upTo(week.flatMap((date) => ONE_WEEK_TIMES.map((time) => `${date}T${time}`)), nowMs)],
      (symbol) => daily[symbol]![Math.max(0, last - 5)]!,
    );
    if (oneDay.labels.length < 2) {
      // Before the first quarter hour of the session: draw from the previous close to now.
      const wall = nyWall(nowMs);
      oneDay.labels.push(wall.date === pricesAsOf && wall.time > ONE_DAY_TIMES[0]! ? `${wall.date}T${wall.time}` : `${pricesAsOf}T16:00`);
      for (const [symbol, quote] of quotes) oneDay.pricesCents[symbol] = [quote.previous, quote.price];
    }

    const series = { "1D": oneDay, "1W": oneWeek, ...dailyRanges(dates, daily, today) } satisfies Record<InvestmentRange, MarketSeries>;

    const securities: Record<string, MarketSecurity> = {};
    for (const { symbol, name, assetClass } of MARKET_SYMBOLS) {
      const quote = quotes.get(symbol);
      if (!quote) continue;
      const year = daily[symbol]!.slice(-WEEK_52_SESSIONS);
      securities[symbol] = {
        symbol,
        name,
        assetClass,
        priceCents: quote.price,
        previousCloseCents: quote.previous,
        week52LowCents: Math.min(...year),
        week52HighCents: Math.max(...year),
        marketCapCents: fundamentals[symbol]?.marketCapCents ?? null,
        peRatio: fundamentals[symbol]?.peRatio ?? null,
        dividendsYtdPerShareCents: dividends[symbol] ?? 0,
      };
    }
    if (!securities[BENCHMARK]) throw new Error("no benchmark price");

    return {
      source: "live",
      marketStatus,
      pricesAsOf,
      securities,
      series,
      benchmarkSymbol: BENCHMARK,
      indexes: INDEXES,
      defaultWatchlist: DEFAULT_WATCHLIST,
      news,
    };
  }
}

/** Live data when the Alpaca keys are set, otherwise the sample data. */
export function createMarketData(env: NodeJS.ProcessEnv): MarketDataProvider {
  const alpacaKeyId = env.ALPACA_API_KEY_ID?.trim();
  const alpacaSecretKey = env.ALPACA_API_SECRET_KEY?.trim();
  if (!alpacaKeyId || !alpacaSecretKey) return new SampleMarketData();
  return new LiveMarketData({ alpacaKeyId, alpacaSecretKey, fmpApiKey: env.FMP_API_KEY?.trim() || null });
}
