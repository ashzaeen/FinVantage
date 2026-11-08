/**
 * Market data for the Investments page, behind one interface so a real feed can replace the
 * sample one in `apps/api/src/deps.ts` without touching the math, the route, or the page.
 *
 * STUB(portfolio): every price, statistic and headline below is made up, and the same inputs
 * always give the same output. Prices for symbols in the demo profile match its `close_price`, so
 * the Investments page adds up to the balances on the Accounts page. Replace with Alpaca and
 * Finnhub. Weekends are skipped, but market holidays are not.
 */
import { INVESTMENT_RANGES, type AssetClass, type InvestmentRange, type MarketSecurity, type MarketSeries, type MarketSnapshot, type NewsHeadline } from "@finvantage/contracts";

export interface MarketDataProvider {
  snapshot(input: { today: string; now: string }): Promise<MarketSnapshot>;
}

interface SampleSymbol {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  priceCents: number;
  beta: number;
  ownVolatility: number;
  dividendYield: number;
  marketCapCents: number | null;
  peRatio: number | null;
}

const T = 100_000_000_000_000; // $1 trillion in cents.
const B = 100_000_000_000; // $1 billion in cents.

const SAMPLE_SYMBOLS: SampleSymbol[] = [
  { symbol: "SPY", name: "S&P 500 ETF", assetClass: "us_stocks", priceCents: 68_000, beta: 1, ownVolatility: 0.0005, dividendYield: 0.012, marketCapCents: null, peRatio: null },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", assetClass: "us_stocks", priceCents: 60_500, beta: 1.25, ownVolatility: 0.002, dividendYield: 0.006, marketCapCents: null, peRatio: null },
  { symbol: "DIA", name: "Dow Jones ETF", assetClass: "us_stocks", priceCents: 47_200, beta: 0.85, ownVolatility: 0.002, dividendYield: 0.015, marketCapCents: null, peRatio: null },
  { symbol: "VTI", name: "Total Stock Market ETF", assetClass: "us_stocks", priceCents: 28_000, beta: 1.02, ownVolatility: 0.001, dividendYield: 0.013, marketCapCents: null, peRatio: null },
  { symbol: "VOO", name: "S&P 500 Index ETF", assetClass: "us_stocks", priceCents: 62_000, beta: 1, ownVolatility: 0.0006, dividendYield: 0.012, marketCapCents: null, peRatio: null },
  { symbol: "VXUS", name: "Total International Stock ETF", assetClass: "international", priceCents: 7_000, beta: 0.7, ownVolatility: 0.004, dividendYield: 0.03, marketCapCents: null, peRatio: null },
  { symbol: "BND", name: "Total Bond Market ETF", assetClass: "bonds", priceCents: 7_200, beta: 0.05, ownVolatility: 0.0025, dividendYield: 0.037, marketCapCents: null, peRatio: null },
  { symbol: "AAPL", name: "Apple", assetClass: "us_stocks", priceCents: 27_000, beta: 1.2, ownVolatility: 0.011, dividendYield: 0.004, marketCapCents: 4 * T, peRatio: 34.2 },
  { symbol: "MSFT", name: "Microsoft", assetClass: "us_stocks", priceCents: 51_000, beta: 1.1, ownVolatility: 0.009, dividendYield: 0.007, marketCapCents: 3.8 * T, peRatio: 37.1 },
  { symbol: "NVDA", name: "NVIDIA", assetClass: "us_stocks", priceCents: 18_500, beta: 1.8, ownVolatility: 0.02, dividendYield: 0.0003, marketCapCents: 4.5 * T, peRatio: 54.3 },
  { symbol: "GOOGL", name: "Alphabet", assetClass: "us_stocks", priceCents: 21_500, beta: 1.15, ownVolatility: 0.012, dividendYield: 0.004, marketCapCents: 2.6 * T, peRatio: 23.8 },
  { symbol: "AMZN", name: "Amazon", assetClass: "us_stocks", priceCents: 22_500, beta: 1.3, ownVolatility: 0.013, dividendYield: 0, marketCapCents: 2.4 * T, peRatio: 33.5 },
  { symbol: "META", name: "Meta Platforms", assetClass: "us_stocks", priceCents: 62_000, beta: 1.3, ownVolatility: 0.015, dividendYield: 0.003, marketCapCents: 1.6 * T, peRatio: 25.9 },
  { symbol: "TSLA", name: "Tesla", assetClass: "us_stocks", priceCents: 34_000, beta: 1.9, ownVolatility: 0.026, dividendYield: 0, marketCapCents: 1.1 * T, peRatio: 96.4 },
  { symbol: "JPM", name: "JPMorgan Chase", assetClass: "us_stocks", priceCents: 29_500, beta: 1, ownVolatility: 0.01, dividendYield: 0.019, marketCapCents: 810 * B, peRatio: 14.6 },
  { symbol: "BTC", name: "Bitcoin", assetClass: "crypto", priceCents: 7_100_000, beta: 1, ownVolatility: 0.028, dividendYield: 0, marketCapCents: 1.4 * T, peRatio: null },
  { symbol: "ETH", name: "Ethereum", assetClass: "crypto", priceCents: 340_000, beta: 1.2, ownVolatility: 0.035, dividendYield: 0, marketCapCents: 410 * B, peRatio: null },
];

const INDEXES = [
  { label: "S&P 500", symbol: "SPY" },
  { label: "Nasdaq 100", symbol: "QQQ" },
  { label: "Dow Jones", symbol: "DIA" },
];

const DEFAULT_WATCHLIST = ["GOOGL", "AMZN", "ETH"];

/** Placeholder stories for the reader. They describe no real event and quote no real source. */
const SAMPLE_ARTICLES: Array<{ title: string; body: string[] }> = [
  {
    title: "Treasury yields hold steady ahead of inflation data",
    body: [
      "Government bond yields changed little as traders waited for the next round of inflation figures, a report that often shapes expectations for interest rates.",
      "When yields stay flat before a major release, it usually means investors are reluctant to take a strong position either way. Bond funds tend to move less than stocks on days like this.",
      "For long-term investors, a single report rarely changes the case for a diversified mix of stocks and bonds. Short-term moves in yields matter most to anyone planning to sell bonds soon.",
    ],
  },
  {
    title: "Large-cap technology leads a late-week rally",
    body: [
      "The largest technology companies carried broad indexes higher to close out the week, as buyers returned to names that had pulled back in earlier sessions.",
      "Because a handful of large companies make up a big share of major indexes, their moves can lift or weigh on the whole market, even when most other stocks are little changed.",
      "Investors who hold broad index funds already own these companies. Checking how much of a portfolio sits in one sector can show whether a rally like this adds more risk than intended.",
    ],
  },
  {
    title: "Energy shares slip as oil prices ease",
    body: [
      "Energy companies lagged the wider market as oil prices drifted lower, trimming some of the sector's gains from earlier in the quarter.",
      "Producer profits tend to follow the price of crude closely, so the group often moves differently from the rest of the market. That difference is one reason investors hold it for diversification.",
      "Lower fuel prices can also help consumers and transportation companies, so a weak day for energy producers is not always a weak day for the economy.",
    ],
  },
  {
    title: "Investors weigh earnings season against rate outlook",
    body: [
      "Markets moved between gains and losses as investors balanced company earnings reports against changing views on where interest rates are heading.",
      "Strong earnings can support higher stock prices, while expectations of higher rates can pull them down by making future profits worth less today. The two forces often pull in opposite directions during reporting season.",
      "Periods like this can feel noisy. A plan built around long-term goals usually depends far more on steady contributions and diversification than on any single week of headlines.",
    ],
  },
];

const HISTORY_SESSIONS = 756; // About three years, which is what the All range shows.
const SESSIONS: Record<Exclude<InvestmentRange, "1D" | "1W" | "YTD" | "ALL">, number> = { "1M": 21, "3M": 63, "1Y": 252 };
const MAX_DAILY_POINTS = 90;
const WEEK_52_SESSIONS = 252;
const MARKET_VOLATILITY = 0.008;
/** A mildly positive latest session, so Top Movers shows gainers and losers and fits the sample headlines. */
const LAST_SESSION_MARKET_MOVE = 0.005;
const DAILY_DRIFT = 0.0004;
const ONE_DAY_TIMES = Array.from({ length: 27 }, (_, i) => clock(9 * 60 + 30 + i * 15));
const ONE_WEEK_TIMES = Array.from({ length: 7 }, (_, i) => clock(10 * 60 + i * 60));

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** FNV-1a, so a symbol always seeds the same random sequence. */
function hash(text: string): number {
  let value = 2_166_136_261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16_777_619);
  }
  return value >>> 0;
}

/** Mulberry32, returning standard normal values through Box-Muller. */
function normals(seed: number): () => number {
  let state = seed;
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
}

function isWeekend(date: Date): boolean {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

/** Trading days, oldest first, ending on the most recent one on or before `today`. */
function sessionsEndingAt(today: string, count: number): string[] {
  const date = new Date(`${today}T00:00:00Z`);
  const sessions: string[] = [];
  while (sessions.length < count) {
    if (!isWeekend(date)) sessions.unshift(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return sessions;
}

function marketStatusAt(now: string): "open" | "closed" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minutes = Number(part("hour")) * 60 + Number(part("minute"));
  const weekday = !["Sat", "Sun"].includes(part("weekday"));
  return weekday && minutes >= 9 * 60 + 30 && minutes < 16 * 60 ? "open" : "closed";
}

/** A wandering path between two known closes, so intraday lines start and end on the real values. */
function bridge(start: number, end: number, steps: number, volatility: number, random: () => number): number[] {
  const walk = [0];
  for (let i = 1; i < steps; i += 1) walk.push(walk[i - 1]! + random() * Math.sqrt(1 / (steps - 1)));
  const finish = walk[steps - 1]!;
  return walk.map((value, i) => {
    const t = steps === 1 ? 1 : i / (steps - 1);
    return Math.round(start + (end - start) * t + (value - t * finish) * volatility * start);
  });
}

/** Evenly thinned, always keeping the first and last points. */
function thinned(indexes: number[]): number[] {
  if (indexes.length <= MAX_DAILY_POINTS) return indexes;
  const step = (indexes.length - 1) / (MAX_DAILY_POINTS - 1);
  return Array.from({ length: MAX_DAILY_POINTS }, (_, i) => indexes[Math.round(i * step)]!);
}

interface SampleHistory {
  sessions: string[];
  closes: Record<string, number[]>;
  series: Record<InvestmentRange, MarketSeries>;
}

function buildHistory(today: string): SampleHistory {
  const sessions = sessionsEndingAt(today, HISTORY_SESSIONS);
  const lastSession = sessions[sessions.length - 1]!;
  const marketRandom = normals(hash(`market:${lastSession}`));
  const marketMoves = sessions.map(() => marketRandom() * MARKET_VOLATILITY);
  marketMoves[marketMoves.length - 1] = LAST_SESSION_MARKET_MOVE;

  const closes: Record<string, number[]> = {};
  for (const sample of SAMPLE_SYMBOLS) {
    const random = normals(hash(`${sample.symbol}:${lastSession}`));
    const path = new Array<number>(sessions.length);
    path[sessions.length - 1] = sample.priceCents;
    for (let i = sessions.length - 1; i > 0; i -= 1) {
      const move = DAILY_DRIFT * sample.beta + sample.beta * marketMoves[i]! + sample.ownVolatility * random();
      path[i - 1] = path[i]! / Math.exp(move);
    }
    closes[sample.symbol] = path.map(Math.round);
  }

  const dailySeries = (indexes: number[]): MarketSeries => ({
    labels: indexes.map((i) => sessions[i]!),
    pricesCents: Object.fromEntries(Object.entries(closes).map(([symbol, path]) => [symbol, indexes.map((i) => path[i]!)])),
  });
  const last = sessions.length - 1;
  const lastSessions = (count: number) => Array.from({ length: count + 1 }, (_, i) => last - count + i);
  const yearStart = sessions.findIndex((date) => date >= `${today.slice(0, 4)}-01-01`);

  const pathsFor = (build: (sample: SampleSymbol, path: number[], random: () => number) => number[]) =>
    Object.fromEntries(
      SAMPLE_SYMBOLS.map((sample) => [
        sample.symbol,
        build(sample, closes[sample.symbol]!, normals(hash(`intraday:${sample.symbol}:${lastSession}`))),
      ]),
    );
  const dayVolatility = (sample: SampleSymbol) => Math.hypot(sample.beta * MARKET_VOLATILITY, sample.ownVolatility);

  const oneDay: MarketSeries = {
    labels: ONE_DAY_TIMES.map((time) => `${lastSession}T${time}`),
    pricesCents: pathsFor((sample, path, random) => bridge(path[last - 1]!, path[last]!, ONE_DAY_TIMES.length, dayVolatility(sample), random)),
  };
  const week = sessions.slice(-5);
  const oneWeek: MarketSeries = {
    labels: [`${sessions[last - 5]!}T16:00`, ...week.flatMap((date) => ONE_WEEK_TIMES.map((time) => `${date}T${time}`))],
    pricesCents: pathsFor((sample, path, random) => {
      const points = [path[last - 5]!];
      for (let day = 4; day >= 0; day -= 1) {
        const stretch = bridge(path[last - day - 1]!, path[last - day]!, ONE_WEEK_TIMES.length + 1, dayVolatility(sample), random);
        points.push(...stretch.slice(1));
      }
      return points;
    }),
  };

  return {
    sessions,
    closes,
    series: {
      "1D": oneDay,
      "1W": oneWeek,
      "1M": dailySeries(lastSessions(SESSIONS["1M"])),
      "3M": dailySeries(lastSessions(SESSIONS["3M"])),
      YTD: dailySeries(thinned(Array.from({ length: Math.max(2, sessions.length - yearStart) }, (_, i) => Math.min(yearStart, last - 1) + i))),
      "1Y": dailySeries(thinned(lastSessions(SESSIONS["1Y"]))),
      ALL: dailySeries(thinned(sessions.map((_, i) => i))),
    } satisfies Record<(typeof INVESTMENT_RANGES)[number], MarketSeries>,
  };
}

export class SampleMarketData implements MarketDataProvider {
  private cached: { today: string; history: SampleHistory } | null = null;

  async snapshot({ today, now }: { today: string; now: string }): Promise<MarketSnapshot> {
    if (this.cached?.today !== today) this.cached = { today, history: buildHistory(today) };
    const { sessions, closes, series } = this.cached.history;
    const pricesAsOf = sessions[sessions.length - 1]!;
    const yearFraction = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${today.slice(0, 4)}-01-01T00:00:00Z`)) / (365 * 86_400_000);

    const securities = Object.fromEntries(
      SAMPLE_SYMBOLS.map((sample): [string, MarketSecurity] => {
        const path = closes[sample.symbol]!;
        const year = path.slice(-WEEK_52_SESSIONS);
        return [
          sample.symbol,
          {
            symbol: sample.symbol,
            name: sample.name,
            assetClass: sample.assetClass,
            priceCents: sample.priceCents,
            previousCloseCents: path[path.length - 2]!,
            week52LowCents: Math.min(...year),
            week52HighCents: Math.max(...year),
            marketCapCents: sample.marketCapCents === null ? null : Math.round(sample.marketCapCents),
            peRatio: sample.peRatio,
            dividendsYtdPerShareCents: Math.round(sample.priceCents * sample.dividendYield * yearFraction),
          },
        ];
      }),
    );

    const news: NewsHeadline[] = SAMPLE_ARTICLES.map((article, i) => ({
      id: `sample-${i}`,
      title: article.title,
      source: "Sample Feed",
      publishedOn: sessions[sessions.length - 1 - i]!,
      body: article.body,
      url: null,
    }));

    return {
      source: "sample",
      marketStatus: marketStatusAt(now),
      pricesAsOf,
      securities,
      series,
      benchmarkSymbol: "SPY",
      indexes: INDEXES,
      defaultWatchlist: DEFAULT_WATCHLIST,
      news,
    };
  }
}
