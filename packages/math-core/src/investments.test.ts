import assert from "node:assert/strict";
import { test } from "node:test";
import type { InvestmentPosition, MarketSecurity, MarketSeries, MarketSnapshot } from "@finvantage/contracts";
import { buildInvestmentsOverview } from "./investments";

function security(symbol: string, priceCents: number, previousCloseCents: number, over: Partial<MarketSecurity> = {}): MarketSecurity {
  return {
    symbol,
    name: `${symbol} Inc`,
    assetClass: "us_stocks",
    priceCents,
    previousCloseCents,
    week52LowCents: priceCents - 1_000,
    week52HighCents: priceCents + 1_000,
    marketCapCents: null,
    peRatio: null,
    dividendsYtdPerShareCents: 100,
    ...over,
  };
}

const twoDays: MarketSeries = {
  labels: ["2026-11-05", "2026-11-06"],
  pricesCents: { AAA: [9_000, 10_000], BBB: [5_500, 5_000], SPY: [59_000, 60_000] },
};

const market: MarketSnapshot = {
  source: "sample",
  marketStatus: "closed",
  pricesAsOf: "2026-11-06",
  securities: {
    AAA: security("AAA", 10_000, 9_000),
    BBB: security("BBB", 5_000, 5_500, { assetClass: "bonds" }),
    SPY: security("SPY", 60_000, 59_000),
  },
  series: { "1D": twoDays, "1W": twoDays, "1M": twoDays, "3M": twoDays, YTD: twoDays, "1Y": twoDays, ALL: twoDays },
  benchmarkSymbol: "SPY",
  indexes: [{ label: "S&P 500", symbol: "SPY" }],
  defaultWatchlist: ["BBB"],
  news: [],
};

const accounts = [{ id: "roth", name: "Roth IRA" }, { id: "brk", name: "Brokerage" }];
const position = (accountId: string, symbol: string | null, quantity: number, costBasisCents: number, lastPriceCents = 10_000): InvestmentPosition => ({
  accountId,
  symbol,
  name: symbol ?? "Cash sweep",
  quantity,
  costBasisCents,
  lastPriceCents,
});
const positions = [
  position("roth", "AAA", 10, 80_000),
  position("roth", null, 500, 50_000, 100),
  position("brk", "AAA", 5, 45_000),
  position("brk", "BBB", 4, 24_000),
];

const overview = buildInvestmentsOverview({ accounts, positions, market });
const view = (id: string) => overview.views.find((v) => v.id === id)!;

test("All comes first and merges one symbol held in two accounts into one row", () => {
  assert.deepEqual(overview.views.map((v) => v.id), ["all", "roth", "brk"]);
  assert.equal(view("all").accountCount, 2);
  const aaa = view("all").holdings.filter((h) => h.symbol === "AAA");
  assert.equal(aaa.length, 1);
  assert.equal(aaa[0]!.quantity, 15);
  assert.equal(aaa[0]!.valueCents, 150_000);
  assert.equal(aaa[0]!.avgCostCents, 8_333);
});

test("the total includes cash, but cash is not a holdings row and earns no return", () => {
  const roth = view("roth");
  assert.equal(roth.totalValueCents, 150_000);
  assert.equal(roth.cashCents, 50_000);
  assert.deepEqual(roth.holdings.map((h) => h.symbol), ["AAA"]);
  assert.equal(roth.totalReturnCents, 20_000);
  assert.equal(roth.totalReturnRate, 0.25);
});

test("today's return compares against the previous close", () => {
  const brk = view("brk");
  // AAA: 5 x +$10. BBB: 4 x -$5.
  assert.equal(brk.dayChangeCents, 5_000 - 2_000);
  assert.equal(brk.dayChangeRate, Math.round((3_000 / 67_000) * 100_000) / 100_000);
});

test("holdings sort by value and report their share of the view", () => {
  const brk = view("brk");
  assert.deepEqual(brk.holdings.map((h) => h.symbol), ["AAA", "BBB"]);
  assert.equal(brk.holdings[0]!.shareOfView, Math.round((50_000 / 70_000) * 100_000) / 100_000);
});

test("allocation weights sum to one and keep a fixed asset-class order", () => {
  const all = view("all").allocation;
  assert.deepEqual(all.map((s) => s.assetClass), ["us_stocks", "bonds", "cash"]);
  assert.ok(Math.abs(all.reduce((sum, s) => sum + s.weight, 0) - 1) < 0.001);
});

test("performance holds share counts and cash steady and compares to the benchmark", () => {
  const range = view("roth").performance["1M"];
  assert.deepEqual(range.points.map((p) => p.valueCents), [140_000, 150_000]);
  assert.equal(range.changeCents, 10_000);
  assert.equal(range.changeRate, Math.round((10_000 / 140_000) * 100_000) / 100_000);
  assert.equal(range.points[0]!.portfolioChangeRate, 0);
  assert.equal(range.benchmarkChangeRate, Math.round((1_000 / 59_000) * 100_000) / 100_000);
});

test("a symbol the market source does not know falls back to the bank's price", () => {
  const result = buildInvestmentsOverview({
    accounts: [{ id: "x", name: "X" }],
    positions: [position("x", "ZZZ", 2, 15_000, 10_000)],
    market,
  });
  const holding = result.views[1]!.holdings[0]!;
  assert.equal(holding.valueCents, 20_000);
  assert.equal(holding.dayChangeRate, 0);
  assert.deepEqual(result.views[1]!.performance["1M"].points.map((p) => p.valueCents), [20_000, 20_000]);
});

test("Markets, Top Movers and the Watchlist options come from the market snapshot", () => {
  assert.deepEqual(overview.markets.map((m) => m.label), ["S&P 500"]);
  assert.deepEqual(overview.topMovers.map((m) => m.symbol), ["AAA", "BBB"]);
  assert.deepEqual(overview.watchlistOptions.map((w) => w.symbol), ["AAA", "BBB"]);
  assert.deepEqual(overview.defaultWatchlist, ["BBB"]);
});

test("a merged holding says which accounts hold it and what it did today", () => {
  const aaa = view("all").holdings.find((h) => h.symbol === "AAA")!;
  assert.deepEqual(aaa.accounts, [
    { accountId: "roth", label: "Roth IRA", quantity: 10, valueCents: 100_000 },
    { accountId: "brk", label: "Brokerage", quantity: 5, valueCents: 50_000 },
  ]);
  assert.equal(aaa.dayChangeCents, 15_000);
  assert.equal(aaa.costBasisCents, 125_000);
  assert.deepEqual(aaa.sparklineCents, [9_000, 10_000]);
  assert.deepEqual(view("roth").holdings[0]!.accounts.map((a) => a.label), ["Roth IRA"]);
});

test("gainers and losers are separated and ranked, and each quote carries its month of prices", () => {
  assert.deepEqual(overview.topGainers.map((q) => q.symbol), ["AAA"]);
  assert.deepEqual(overview.topLosers.map((q) => q.symbol), ["BBB"]);
  assert.deepEqual(overview.topLosers[0]!.sparklineCents, [5_500, 5_000]);
  assert.deepEqual(overview.markets[0]!.sparklineCents, [59_000, 60_000]);
  assert.deepEqual(overview.sparklineDates, ["2026-11-05", "2026-11-06"]);
});

test("an account with no positions still produces an empty, valid view", () => {
  const result = buildInvestmentsOverview({ accounts: [{ id: "x", name: "X" }], positions: [], market });
  assert.equal(result.views[1]!.totalValueCents, 0);
  assert.equal(result.views[1]!.totalReturnRate, 0);
  assert.deepEqual(result.views[1]!.holdings, []);
});
