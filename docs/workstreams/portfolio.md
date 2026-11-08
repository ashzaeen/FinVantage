# Portfolio

**Owner:** Ashzaeen. **Tier:** P2. **Code:** `getPortfolio` in `apps/api/src/routes/mocked.ts`, and `apps/web/src/app/(app)/portfolio`. **PRD:** section 4, feature 6.

## Scope

The investment view: holdings, allocation, and a comparison against a benchmark.

## You have now

`GET /v1/investments` drives `/portfolio`: an All view plus one per account (Roth IRA, 401(k), Brokerage), each with tiles, chart ranges, allocation and holdings, then a Watchlist, Markets, Top Movers and Market News. The figures are computed in `packages/math-core/src/investments.ts`. The contract forces `mocked: true`, and the page must keep showing `MockedBadge`.

Positions come from the demo fixture. Prices, history, dividends and news come from Alpaca, and market cap and P/E from Financial Modeling Prep, through `LiveMarketData` in `packages/data/src/market-live.ts`. `createMarketData` in `apps/api/src/deps.ts` picks it when `ALPACA_API_KEY_ID` and `ALPACA_API_SECRET_KEY` are set (`FMP_API_KEY` is optional). Without the keys, or if the feed fails before any good snapshot, `SampleMarketData` in `market.ts` supplies made-up prices that match the fixture's close prices, and the page says so. With live prices, a view's total no longer matches its balance on the Accounts page, because the demo balances are fixed.

## Still to do

Tagged `STUB(portfolio)`:

1. Done 2026-11-08: the live feed (Alpaca, plus FMP in place of Finnhub). Top Movers ranks the page's own symbols rather than Alpaca's movers screener, which lists penny stocks and warrants.
2. Read positions from the ledger's `holding` and `security` data, so linked accounts appear. `demoInvestments` reads the fixture for every user today.
3. Move the Watchlist from browser storage to a store, and search symbols through the feed instead of the sample list.
4. Done 2026-11-08: `NewsHeadline.body` and `url` come from Alpaca's news (Benzinga and others).

## Done means

- An allocation chart and a benchmark line render from the data.
- The holdings add up to the account balances shown elsewhere.
- Mocked values stay labelled as mocked.

## Depends on

The data model ([transactions](transactions.md), [platform](platform.md)) for reading holdings through the store.
