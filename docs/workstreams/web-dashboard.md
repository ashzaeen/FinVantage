# Dashboard and design

**Owner:** Ashzaeen. **Tier:** P0. **Code:** `apps/web`. **Guide:** `apps/web/AGENTS.md`. **PRD:** sections 1, 4, 5, 11.

## Scope

The whole web experience, and the design track entry: net worth and accounts, goals, the simulator with fan chart and what-if sliders, Copilot activity, and the P1 and P2 views.

## You have now

Every page exists, loads real API data, and is responsive, with placeholder styling. The stubs return realistic shapes, so you can design against them today.

## Start here

1. Set the visual language in `src/app/globals.css`: type, color tokens for light and dark, spacing.
2. Build the fan chart. It is the headline of the design track. Keep the props in `components/finance/FanChart.tsx`.
3. Polish the simulator page, then Overview and Goals.
4. Design the Copilot overlay card with the extension owner. It must match the dashboard, and its styles live in `apps/extension/src/content/overlay.ts`.

## Done means

- All six account categories show with balances, and net worth has a chart and a breakdown.
- The fan chart shows a median and percentile band, and sliders update in under 2 seconds.
- Every probability is a range with a disclaimer. Mocked values are labeled.
- Every number links to its inputs, and every recommendation lists its figures.
- It works down to phone width and by keyboard, with readable contrast.
- The live demo works: add a transaction or open a listing, and the dashboard updates without a restart.
- `tier` and `prd` labels are gone from `PageHeader`.

## Depends on

The API contracts, which already exist. If you need a figure that is missing, ask for it in the API rather than computing it in the browser.
