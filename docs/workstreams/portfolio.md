# Portfolio

**Owner:** Ashzaeen. **Tier:** P2. **Code:** `getPortfolio` in `apps/api/src/routes/mocked.ts`, and `apps/web/src/app/(app)/portfolio`. **PRD:** section 4, feature 6.

## Scope

The investment view: holdings, allocation, and a comparison against a benchmark.

## You have now

A mocked route with two holdings and a two-point benchmark, and a page with charts. The contract forces `mocked: true`, and the page must keep showing `MockedBadge`.

Demo IRA holdings already exist in the data model, in the `holding` and `security` tables (`docs/DATA-MODEL.md`).

## Start here

1. Serve the holdings from the demo profile's `holding` and `security` data instead of the hard-coded list, so the portfolio matches the IRA balance on the Accounts page.
2. Compute allocation from those holdings in the API.
3. Keep the benchmark line mocked. There is no market data feed in v1.
4. Redesign `/portfolio` to match the landing page's style.

## Done means

- An allocation chart and a benchmark line render from the data.
- The holdings add up to the IRA balance shown elsewhere.
- Mocked values stay labelled as mocked.

## Depends on

The data model ([transactions](transactions.md), [platform](platform.md)) for reading holdings through the store.
