# Dashboard and design

**Owner:** Ashzaeen. **Tier:** P0. **Code:** `apps/web`. **Guide:** `apps/web/AGENTS.md`. **PRD:** sections 1, 4, 5, 11.

## Scope

The whole web experience, and the design track entry: net worth and accounts, goals, the simulator with fan chart and what-if sliders, Copilot activity, and the P1 and P2 views.

## You have now

Every page exists, loads real API data, and is responsive, with placeholder styling. The stubs return realistic shapes, so you can design against them today.

The Goals page can create savings goals through the existing API, including target/current amounts, date, priority, flexibility, and an optional linked account. After saving, the page refreshes so the new goal and its simulation outcome appear together.

Goal cards open a manage dialog with the simulation's probability range and editable goal details. Changes save through the goals API and refresh the simulation; deletion requires an in-dialog confirmation. Priority is presented as High, Medium, or Low and maps to simulator ranks 1, 2, and 3.

The Goals page offers Kanban, Cards, and Analysis views in the header. The Kanban board has To-do, In progress, and Achieved columns; users can add a goal directly to a column, drag a card from anywhere on its tile, or use each card's Move to selector for a quick status change. Manage opens the dialog to edit all goal details. Cards view has an add-goal tile after the last card. Analysis is read-only and charts the goal count in each of the three stages. Existing goals without a stored status receive an initial status based on progress.

The Accounts page shows net worth, assets, liabilities, signed balances by account type, and an estimated net worth trend reconstructed from current balances and recorded transactions. Its expandable account directory lists institutions, account names, types, and balances. Account rows open a details view with interest rates, payment details, promo dates, and recent transactions; users can add or edit accounts manually. Recognized institution names use their site favicon as a logo, with initials as a fallback.

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
