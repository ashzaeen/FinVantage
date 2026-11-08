/**
 * Every figure on the Investments page. Pure: the positions and market data come in as arguments.
 *
 * Assumptions:
 * - Share counts and cash are held steady across a chart's range, so the line shows how today's
 *   portfolio would have moved. Past deposits and trades are not modeled.
 * - Total return excludes cash, and a position with no cost basis counts as break-even.
 * - A symbol the market source does not know uses the bank's last price and shows no daily change.
 */
import {
  ALL_ACCOUNTS_VIEW,
  AssetClass,
  INVESTMENT_RANGES,
  type InvestmentAccountRef,
  type InvestmentHolding,
  type InvestmentPosition,
  type InvestmentRange,
  type InvestmentsOverview,
  type InvestmentView,
  type MarketQuote,
  type MarketSecurity,
  type MarketSeries,
  type MarketSnapshot,
  type RangePerformance,
  type WatchlistItem,
} from "@finvantage/contracts";

/** How many symbols the Top Movers tile lists. */
export const TOP_MOVERS_COUNT = 5;
const RATE_PRECISION = 100_000;

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * RATE_PRECISION) / RATE_PRECISION);

interface Priced {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  costCents: number;
  priceCents: number;
  previousCloseCents: number;
  dividendsPerShareCents: number;
  lots: Array<{ accountId: string; quantity: number }>;
}

function priced(position: InvestmentPosition & { symbol: string }, security: MarketSecurity | undefined): Priced {
  const priceCents = security?.priceCents ?? position.lastPriceCents;
  return {
    symbol: position.symbol,
    name: position.name,
    assetClass: security?.assetClass ?? "us_stocks",
    quantity: position.quantity,
    costCents: position.costBasisCents ?? Math.round(position.quantity * priceCents),
    priceCents,
    previousCloseCents: security?.previousCloseCents ?? priceCents,
    dividendsPerShareCents: security?.dividendsYtdPerShareCents ?? 0,
    lots: [{ accountId: position.accountId, quantity: position.quantity }],
  };
}

/** One row per symbol, so the same fund held in two accounts reads as one holding. */
function mergeBySymbol(positions: Priced[]): Priced[] {
  const merged = new Map<string, Priced>();
  for (const position of positions) {
    const existing = merged.get(position.symbol);
    if (existing) {
      existing.quantity += position.quantity;
      existing.costCents += position.costCents;
      existing.lots.push(...position.lots);
    } else {
      merged.set(position.symbol, { ...position, lots: [...position.lots] });
    }
  }
  return [...merged.values()];
}

function rangePerformance(series: MarketSeries, holdings: Priced[], cashCents: number, benchmarkSymbol: string): RangePerformance {
  const values = series.labels.map((_, index) =>
    holdings.reduce(
      (sum, holding) => sum + Math.round(holding.quantity * (series.pricesCents[holding.symbol]?.[index] ?? holding.priceCents)),
      cashCents,
    ),
  );
  const benchmark = series.pricesCents[benchmarkSymbol];
  const benchmarkStart = benchmark?.[0] ?? 0;
  const benchmarkRate = (index: number) => (benchmark ? ratio(benchmark[index]! - benchmarkStart, benchmarkStart) : 0);
  const start = values[0] ?? 0;
  const last = values.length - 1;
  return {
    points: series.labels.map((at, index) => ({
      at,
      valueCents: values[index]!,
      portfolioChangeRate: ratio(values[index]! - start, start),
      benchmarkChangeRate: benchmarkRate(index),
    })),
    changeCents: (values[last] ?? 0) - start,
    changeRate: ratio((values[last] ?? 0) - start, start),
    benchmarkChangeRate: last >= 0 ? benchmarkRate(last) : 0,
  };
}

function buildView(
  id: string,
  label: string,
  accountCount: number,
  positions: InvestmentPosition[],
  market: MarketSnapshot,
  accountNames: ReadonlyMap<string, string>,
): InvestmentView {
  const cashCents = positions
    .filter((p) => p.symbol === null)
    .reduce((sum, p) => sum + Math.round(p.quantity * p.lastPriceCents), 0);
  const held = mergeBySymbol(
    positions
      .filter((p): p is InvestmentPosition & { symbol: string } => p.symbol !== null)
      .map((p) => priced(p, market.securities[p.symbol])),
  );

  const valueOf = (h: Priced) => Math.round(h.quantity * h.priceCents);
  const dayChangeOf = (h: Priced) => Math.round(h.quantity * (h.priceCents - h.previousCloseCents));
  const investedCents = held.reduce((sum, h) => sum + valueOf(h), 0);
  const totalValueCents = investedCents + cashCents;
  const dayChangeCents = held.reduce((sum, h) => sum + dayChangeOf(h), 0);
  const costCents = held.reduce((sum, h) => sum + h.costCents, 0);

  const holdings: InvestmentHolding[] = held
    .map((h) => ({
      symbol: h.symbol,
      name: h.name,
      assetClass: h.assetClass,
      priceCents: h.priceCents,
      dayChangeRate: ratio(h.priceCents - h.previousCloseCents, h.previousCloseCents),
      quantity: h.quantity,
      avgCostCents: h.quantity === 0 ? 0 : Math.round(h.costCents / h.quantity),
      costBasisCents: h.costCents,
      valueCents: valueOf(h),
      dayChangeCents: dayChangeOf(h),
      totalReturnCents: valueOf(h) - h.costCents,
      totalReturnRate: ratio(valueOf(h) - h.costCents, h.costCents),
      shareOfView: ratio(valueOf(h), totalValueCents),
      sparklineCents: market.series["1M"].pricesCents[h.symbol] ?? [],
      accounts: h.lots.map((lot) => ({
        accountId: lot.accountId,
        label: accountNames.get(lot.accountId) ?? lot.accountId,
        quantity: lot.quantity,
        valueCents: Math.round(lot.quantity * h.priceCents),
      })),
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  const classValue = (assetClass: AssetClass) =>
    assetClass === "cash" ? cashCents : held.filter((h) => h.assetClass === assetClass).reduce((sum, h) => sum + valueOf(h), 0);

  const performance = Object.fromEntries(
    INVESTMENT_RANGES.map((range: InvestmentRange) => [
      range,
      rangePerformance(market.series[range], held, cashCents, market.benchmarkSymbol),
    ]),
  ) as InvestmentView["performance"];

  return {
    id,
    label,
    accountCount,
    totalValueCents,
    dayChangeCents,
    dayChangeRate: ratio(dayChangeCents, totalValueCents - dayChangeCents),
    totalReturnCents: investedCents - costCents,
    totalReturnRate: ratio(investedCents - costCents, costCents),
    cashCents,
    dividendsYtdCents: held.reduce((sum, h) => sum + Math.round(h.quantity * h.dividendsPerShareCents), 0),
    allocation: AssetClass.options
      .map((assetClass) => ({ assetClass, valueCents: classValue(assetClass), weight: ratio(classValue(assetClass), totalValueCents) }))
      .filter((slice) => slice.valueCents > 0),
    holdings,
    performance,
  };
}

function quote(security: MarketSecurity, market: MarketSnapshot): MarketQuote {
  return {
    symbol: security.symbol,
    name: security.name,
    priceCents: security.priceCents,
    dayChangeRate: ratio(security.priceCents - security.previousCloseCents, security.previousCloseCents),
    sparklineCents: market.series["1M"].pricesCents[security.symbol] ?? [],
  };
}

function watchlistItem(security: MarketSecurity, market: MarketSnapshot): WatchlistItem {
  return {
    ...quote(security, market),
    week52LowCents: security.week52LowCents,
    week52HighCents: security.week52HighCents,
    marketCapCents: security.marketCapCents,
    peRatio: security.peRatio,
  };
}

export function buildInvestmentsOverview(input: {
  accounts: InvestmentAccountRef[];
  positions: InvestmentPosition[];
  market: MarketSnapshot;
}): InvestmentsOverview {
  const { accounts, positions, market } = input;
  const indexSymbols = new Set(market.indexes.map((index) => index.symbol));
  const tradable = Object.values(market.securities).filter((s) => !indexSymbols.has(s.symbol));
  const quotes = tradable.map((security) => quote(security, market));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  return {
    mocked: true,
    priceSource: market.source,
    marketStatus: market.marketStatus,
    pricesAsOf: market.pricesAsOf,
    views: [
      buildView(ALL_ACCOUNTS_VIEW, "All", accounts.length, positions, market, accountNames),
      ...accounts.map((account) => buildView(account.id, account.name, 1, positions.filter((p) => p.accountId === account.id), market, accountNames)),
    ],
    markets: market.indexes.flatMap((index) => {
      const security = market.securities[index.symbol];
      return security ? [{ ...quote(security, market), label: index.label }] : [];
    }),
    topMovers: [...quotes].sort((a, b) => Math.abs(b.dayChangeRate) - Math.abs(a.dayChangeRate)).slice(0, TOP_MOVERS_COUNT),
    topGainers: quotes.filter((q) => q.dayChangeRate > 0).sort((a, b) => b.dayChangeRate - a.dayChangeRate).slice(0, TOP_MOVERS_COUNT),
    topLosers: quotes.filter((q) => q.dayChangeRate < 0).sort((a, b) => a.dayChangeRate - b.dayChangeRate).slice(0, TOP_MOVERS_COUNT),
    sparklineDates: market.series["1M"].labels,
    watchlistOptions: tradable.map((security) => watchlistItem(security, market)).sort((a, b) => a.symbol.localeCompare(b.symbol)),
    defaultWatchlist: market.defaultWatchlist,
    news: market.news,
  };
}
