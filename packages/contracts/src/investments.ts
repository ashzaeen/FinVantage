import { z } from "zod";
import { Cents, IsoDate, Rate } from "./common";

/** The chart's time ranges, in display order. */
export const INVESTMENT_RANGES = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
export const InvestmentRange = z.enum(INVESTMENT_RANGES);
export type InvestmentRange = z.infer<typeof InvestmentRange>;

export const AssetClass = z.enum(["us_stocks", "international", "bonds", "crypto", "cash"]);
export type AssetClass = z.infer<typeof AssetClass>;

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  us_stocks: "US Stocks",
  international: "International",
  bonds: "Bonds",
  crypto: "Crypto",
  cash: "Cash",
};

/** The view id that combines every investment account. */
export const ALL_ACCOUNTS_VIEW = "all";

export const InvestmentHolding = z.object({
  symbol: z.string(),
  name: z.string(),
  assetClass: AssetClass,
  priceCents: Cents,
  dayChangeRate: Rate,
  /** Fractional for crypto. */
  quantity: z.number(),
  avgCostCents: Cents,
  costBasisCents: Cents,
  valueCents: Cents,
  dayChangeCents: Cents,
  totalReturnCents: Cents,
  totalReturnRate: Rate,
  /** Share of this view's total value, cash included. */
  shareOfView: Rate,
  /** Closing prices over the past month, matching `sparklineDates`. Empty if the source has none. */
  sparklineCents: z.array(Cents),
  /** Where this holding is held. One entry on a single-account view. */
  accounts: z.array(z.object({ accountId: z.string(), label: z.string(), quantity: z.number(), valueCents: Cents })),
});
export type InvestmentHolding = z.infer<typeof InvestmentHolding>;

export const AllocationSlice = z.object({ assetClass: AssetClass, valueCents: Cents, weight: Rate });
export type AllocationSlice = z.infer<typeof AllocationSlice>;

export const PerformancePoint = z.object({
  /** An ISO date, or `YYYY-MM-DDTHH:mm` in market time for the 1D and 1W ranges. */
  at: z.string(),
  valueCents: Cents,
  portfolioChangeRate: Rate,
  benchmarkChangeRate: Rate,
});
export type PerformancePoint = z.infer<typeof PerformancePoint>;

export const RangePerformance = z.object({
  points: z.array(PerformancePoint),
  changeCents: Cents,
  changeRate: Rate,
  benchmarkChangeRate: Rate,
});
export type RangePerformance = z.infer<typeof RangePerformance>;

/** Every figure the page shows for one account, or for all of them combined. */
export const InvestmentView = z.object({
  /** `ALL_ACCOUNTS_VIEW`, or an account id. */
  id: z.string(),
  label: z.string(),
  accountCount: z.number().int().nonnegative(),
  totalValueCents: Cents,
  dayChangeCents: Cents,
  dayChangeRate: Rate,
  totalReturnCents: Cents,
  totalReturnRate: Rate,
  cashCents: Cents,
  dividendsYtdCents: Cents,
  allocation: z.array(AllocationSlice),
  holdings: z.array(InvestmentHolding),
  performance: z.object({
    "1D": RangePerformance,
    "1W": RangePerformance,
    "1M": RangePerformance,
    "3M": RangePerformance,
    YTD: RangePerformance,
    "1Y": RangePerformance,
    ALL: RangePerformance,
  }),
});
export type InvestmentView = z.infer<typeof InvestmentView>;

export const MarketQuote = z.object({
  symbol: z.string(),
  name: z.string(),
  priceCents: Cents,
  dayChangeRate: Rate,
  /** Closing prices over the past month, matching `sparklineDates`. Empty if the source has none. */
  sparklineCents: z.array(Cents),
});
export type MarketQuote = z.infer<typeof MarketQuote>;

export const WatchlistItem = MarketQuote.extend({
  week52LowCents: Cents,
  week52HighCents: Cents,
  /** Null for funds and crypto when the source has none. */
  marketCapCents: Cents.nullable(),
  peRatio: z.number().nullable(),
});
export type WatchlistItem = z.infer<typeof WatchlistItem>;

export const NewsHeadline = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  publishedOn: IsoDate,
  /** The story as paragraphs, shown in the reader. */
  body: z.array(z.string()),
  /** The original story, when the source provides one. Sample headlines have none. */
  url: z.url().nullable(),
});
export type NewsHeadline = z.infer<typeof NewsHeadline>;

/**
 * Where prices, history and news came from: `live` is Alpaca (with FMP for market cap and P/E),
 * `sample` is the made-up fallback.
 */
export const PriceSource = z.enum(["sample", "live"]);
export type PriceSource = z.infer<typeof PriceSource>;

/** Share counts are demo data even when prices are live, so `mocked` stays a literal. */
export const InvestmentsOverview = z.object({
  mocked: z.literal(true),
  priceSource: PriceSource,
  marketStatus: z.enum(["open", "closed"]),
  pricesAsOf: IsoDate,
  /** `views[0]` is always the All view. */
  views: z.array(InvestmentView).min(1),
  markets: z.array(MarketQuote.extend({ label: z.string() })),
  topMovers: z.array(MarketQuote),
  topGainers: z.array(MarketQuote),
  topLosers: z.array(MarketQuote),
  /** The date of each point in every `sparklineCents` list. */
  sparklineDates: z.array(IsoDate),
  /** Every symbol the Watchlist can add. */
  watchlistOptions: z.array(WatchlistItem),
  defaultWatchlist: z.array(z.string()),
  news: z.array(NewsHeadline),
});
export type InvestmentsOverview = z.infer<typeof InvestmentsOverview>;

// Inputs to the investment math. These stay on the server and are not part of the API.

export interface InvestmentAccountRef {
  id: string;
  name: string;
}

export interface InvestmentPosition {
  accountId: string;
  /** Null for cash. */
  symbol: string | null;
  name: string;
  quantity: number;
  costBasisCents: number | null;
  /** The bank's last price, used when the market source does not know the symbol. */
  lastPriceCents: number;
}

export interface MarketSecurity {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  priceCents: number;
  previousCloseCents: number;
  week52LowCents: number;
  week52HighCents: number;
  marketCapCents: number | null;
  peRatio: number | null;
  dividendsYtdPerShareCents: number;
}

export interface MarketSeries {
  labels: string[];
  pricesCents: Record<string, number[]>;
}

export interface MarketSnapshot {
  source: PriceSource;
  marketStatus: "open" | "closed";
  pricesAsOf: string;
  securities: Record<string, MarketSecurity>;
  series: Record<InvestmentRange, MarketSeries>;
  /** The symbol whose series is the chart's comparison line. */
  benchmarkSymbol: string;
  indexes: Array<{ label: string; symbol: string }>;
  defaultWatchlist: string[];
  news: NewsHeadline[];
}
