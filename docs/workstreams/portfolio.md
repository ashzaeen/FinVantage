# Portfolio

**Owner:** Ashzaeen. **Tier:** P2. **Code:** `getPortfolio` in `apps/api/src/routes/mocked.ts`, and `apps/web/src/app/(app)/portfolio`. **PRD:** section 4, feature 6.

## Scope

The investment view: holdings, allocation, and a comparison against a benchmark.

## You have now

`GET /v1/investments` drives `/portfolio`: an All view plus one per account (Roth IRA, 401(k), Brokerage), each with tiles, chart ranges, allocation and holdings, then a Watchlist, Markets, Top Movers and Market News. The figures are computed in `packages/math-core/src/investments.ts`. The contract forces `mocked: true`, and the page must keep showing `MockedBadge`.

Positions come from the demo fixture. Prices, history, statistics and headlines come from `SampleMarketData` in `packages/data/src/market.ts`, which matches the fixture's close prices so each view adds up to its balance on the Accounts page.

## Still to do

Tagged `STUB(portfolio)`:

1. Add a real market feed behind `MarketDataProvider` and choose it in `apps/api/src/deps.ts`. The plan is Alpaca for prices and history and Finnhub for market cap, P/E and news. Confirm Alpaca's movers and news endpoints with a real request. Keep keys on the server, and fall back to the last good prices so the page never goes blank.
2. Read positions from the ledger's `holding` and `security` data, so linked accounts appear. `demoInvestments` reads the fixture for every user today.
3. Move the Watchlist from browser storage to a store, and search symbols through the feed instead of the sample list.
4. Fill `NewsHeadline.body` and `url` from the news feed, so the reader shows real stories and links to their source.

## Done means

- An allocation chart and a benchmark line render from the data.
- The holdings add up to the account balances shown elsewhere.
- Mocked values stay labelled as mocked.

## Depends on

The data model ([transactions](transactions.md), [platform](platform.md)) for reading holdings through the store.
