# Dashboard Enhancements: Handoff

Written 2026-11-23 when work stopped partway through phase 2. Read this first, then `docs/workstreams/dashboard-enhancements.md` (the plan and decisions D1 to D8) and `docs/design/dashboard-enhancements-design.md` (the design plan). The ideas and audit are in `docs/design/dashboard-ideas.html`; wireframes are in `docs/design/dashboard-enhancements-wireframes.html`.

## State in one paragraph

Phases 0 and 1 are built and verified. Phase 2 is **half built**: every API route, contract and pure function for it exists and is tested, but only the Overview part of its UI is built. **Nothing is committed.** All the work, from all three phases, sits uncommitted in the working tree on the branch `dash-figures` (127 modified tracked files plus new files). The branches `dash-fixes` and `dash-quick-wins` exist but point at old commits and hold nothing. `npm run check` passes (187 API tests, 146 math-core, 91 web, and the rest). The newest web work (`OverviewPlanning.tsx`) typechecks but has **not been looked at in a browser**.

## First things to do

1. `git status` and read it. The tree also holds other people's uncommitted work (dark mode in `apps/web/src/components/theme` and `src/lib/theme*.ts`, a voice feature in `docs/workstreams/voice.md`, `src/lib/dictation.ts`, `useSpeechRecognition.ts`, and a one-line `advisory/speak` change in `apps/api/src/rate-limit.ts`). Do not revert any of it, and do not commit it as part of this work.
2. `npm run check` from the repo root. It should pass as it does now.
3. Decide how to commit. A sensible split, since each step is independent: (a) phase 0, (b) phase 1, (c) phase 2 so far. The files are not separated by phase in git, so use `git add -p` or split by path, or commit once and describe the phases in the message. Do not commit without the owner's go-ahead.
4. Start the API and web (`npm run dev:api`, `npm run dev:web`) and look at `/app` before building anything else. See "Gotchas".

## Phase 0: done

Fixes, recorded in `docs/DECISIONS.md` under "Dashboard enhancements, phase 0". Highlights: one meaning of "Spent" (`spentCents` and `savedCents` on the spending summary); the demo clock (`deps.today()` is never earlier than `DEMO_DATA_ENDS_ON` = 2026-12-03, so until Dec 3 the app's "this month" is December with three days of data); Reports, Copilot and Life Events open on an example instead of blank; duplicate lists removed; "Top 10 Purchases"; median for budget "Usually".

## Phase 1: done, 29 of 32 ideas

Recorded in `docs/DECISIONS.md` under "Dashboard enhancements, phase 1", with a table in the plan ("Phase 1 result"). New shared chart pieces are in `apps/web/src/components/charts`: `BulletBar`, `Sparkline`, `HeatGrid`, `DotCalendar`. Not built, and why: stale-account flag (accounts keep no last-updated time), linked-bank health (bank items keep no last-sync time), wins timeline on Reports (goal balances have no history).

## Phase 2: what exists

### Backend, complete and tested

Contracts are in `packages/contracts/src/planning.ts` (and `insights.ts`, `transaction-insights.ts` from phase 1). Pure functions are in `packages/math-core/src/planning.ts` with tests in `planning.test.ts`. Routes are in `apps/api/src/routes/planning.ts`, registered in `apps/api/src/app.ts`, tested in `apps/api/src/app.test.ts`. The client methods exist automatically (`api.getSafeToSpend()` and so on).

| Client method | Route | What it returns |
| --- | --- | --- |
| `getSafeToSpend` | `GET /v1/overview/safe-to-spend` | Safe figure and its four parts |
| `getAttention` | `GET /v1/overview/attention` | Up to five ranked items, sentences already written |
| `getHealthScore` | `GET /v1/health-score` | Score, label, four weighted parts |
| `getGoalFunding` | `GET /v1/goals/funding` | Needed per month per goal, median finish dates, totals |
| `getSpendingPace` | `GET /v1/spending/pace` | Cumulative spend this month and last, same-day gap, projection, budget total |
| `listBudgetSuggestions` | `GET /v1/budgets/suggestions` | Limits for categories with no budget. Saves nothing |
| `listUnusualCharges` | `GET /v1/transactions/unusual` | Charges at least 2x the merchant's usual and $20 above it |
| `creditWhatIf` | `POST /v1/credit/what-if` | Before and after utilization and a mocked score range. Changes nothing. On the demo token's allowlist |
| `getDebtPayoff` | `GET /v1/debt/payoff?extraCents=` | Avalanche and snowball plans for cards and loans |
| `getAllocationDrift` | `GET /v1/investments/drift` | Actual vs target per asset class, dollars to move. Mocked |
| `setTargetAllocation` | `PATCH /v1/investments/targets` | Saves the target mix, returns the drift. Must add to 100% or it is a 400 |
| `getCopilotImpact` | `GET /v1/copilot/impact` | Checked, flagged, dollars flagged, months of goals at stake |
| (field) | `getIncomeSummary().variability` | Sources whose monthly total moves a lot, with low, typical, high |

Choices that are not obvious:

- Target allocation is stored on the user's **spending profile document** (`SpendingProfile.targetAllocation`, optional), not on `User`. `User.preferences` is a column in SpacetimeDB and changing it means changing and republishing the Spacetime module. The profile document is MongoDB or memory and takes an optional field freely.
- `spendingContext(deps)` in `apps/api/src/routes/spending.ts` is the shared source for the spending profile, catalog, transactions, six-month summary and budgets. New planning routes use it. It was extracted from `registerSpendingRoutes`.
- `MOCK_CREDIT_SCORE` (742) is exported from `apps/api/src/routes/mocked.ts` and used by the what-if. The score estimate is a documented piecewise rule (`UTILIZATION_SCORE_POINTS` in `planning.ts`), always a range of plus or minus 15, always `mocked: true`.
- Debt payoff covers cards and loans, **not** the mortgage. A debt with no stated minimum is assumed to need 2% of its balance, at least $25. Interest is balance times rate over twelve each month. A 0% promo card is treated as 0% for the whole plan.
- Goal funding is plain arithmetic: remaining over months left, rounded up. It ignores growth and interest, so the simulator's odds can disagree with it (the demo shows goals needing more a month than the profile says is saved, while the odds read 97 to 99%). Any UI that shows both must say that. Do not add a "shortfall" verdict.
- `goalFunding` runs the simulator once (not saved) to get median finish dates. It is a GET so the existing compute rate limit (POST only) does not cover it.

### Frontend, done

Only the Overview: `apps/web/src/app/(app)/app/OverviewPlanning.tsx` exports `AttentionStrip`, `SafeToSpendCard` and `HealthScoreCard`, wired into `app/page.tsx` above the existing Cash Runway and Savings Rate cards. Each fetch is `.catch(() => null)` so a failure hides the card, not the page.

## Phase 2: still to build (the UI, in this order)

All data is ready. Follow the design plan's wireframes (W-numbers) and the rules below. For each: fetch on the server page with `.catch`, render a card, add a hidden text version for access, check at 390px and 1440px, and look at it in the browser.

1. **Goals** (GO1, GO5; `apps/web/src/app/(app)/goals/page.tsx` and `GoalsClient.tsx`). Fetch `getGoalFunding()`. In `GoalCard`, under the "Next mark" line, add "Needs about $X a month for N months" (hide when `remainingCents` is 0; say the date has passed when `pastDue`) and "Median finish: Mar 2028" from `medianCompletionDate`. Add a small summary card above the board: "Together your goals need about $X a month at a steady pace. You set aside about $Y a month." with the caveat that the simulated odds also count interest and growth. Add a `monthYear(iso)` helper to `src/lib/format.ts` with a test.
2. **Spending** (SP1, SP6; `spending/page.tsx`, new files beside it). `PaceChart`: an SVG with this month solid (`--series-1`), last month dashed (`--ink-muted`), the budget total as a flat line (`--flow-out`), a label in words like "Day 21: $410 under last month's pace", and a hidden table. `BudgetSuggestions` (client): list `listBudgetSuggestions()` rows, each with an "Add This Limit" button that calls `api.setBudget({ body: { category, monthlyLimitCents } })` then `router.refresh()`. Saving needs the button press (rule 9). Hide the card when there are none.
3. **Transactions** (TX2; `transactions/page.tsx` and `TransactionsClient.tsx`). Fetch `listUnusualCharges()`, pass a map by id, show a chip under the merchant: "2.4x usual here" with the usual amount in the title and the hidden text. Orange outline (`--flow-out`), never red.
4. **Credit** (CR1, CR2; `credit/page.tsx`). `CreditWhatIf` (client): a card picker and a slider from $0 to the balance (44px tall, 16px fields); on release call `api.creditWhatIf`; show before and after utilization and the score range, always beside `MockedBadge`, with "Demo estimate. Real scores vary by bureau and model." Never save anything. `DebtPayoffCard` (client): an extra-per-month field, call `api.getDebtPayoff` (debounced) and draw the two plans' `balanceByMonth` as two lines with payoff dates and "Avalanche saves $X in interest" (W6). Copy says "Consider paying X first", never an instruction.
5. **Accounts** (AC3; `accounts/AccountsClient.tsx` or `page.tsx`). Reuse `DebtPayoffCard`.
6. **Investments** (IV1; `portfolio/`). `AllocationDriftCard` (client) from `getAllocationDrift()`: a `BulletBar` per class with a target tick and the band (`band` is 0.05), the dollars to move in words ("Consider adding about $15,000 to bonds"), `MockedBadge`, and a clear "These are suggestions: nothing is bought or sold". When `targetsSet` is false, say the rows use a balanced starting mix as a suggestion. Offer presets (for example Growth, Balanced, Conservative) defined in the web lib, preview the drift, and call `api.setTargetAllocation` only on a "Save Targets" confirm. Targets must sum to 1 (the API refuses otherwise).
7. **Income** (IN2; `income/page.tsx`). A card from `income.variability`: for each variable source, a bar with its low to high range as a band and the typical month as the fill, with a plain sentence ("Self-Employment usually brings $650, from $400 to $1,200"). Hide the card when empty.
8. **Copilot** (CP2; `copilot/page.tsx`). Four tiles from `getCopilotImpact()`: checked, flagged, dollars flagged, months of goals at stake. Show a friendly zero state.
9. **Optional:** show `HealthScoreCard` on Reports too (RP3 said Reports and Overview). Reuse the component.

### Deferred in phase 2, with reasons

- Net worth drivers (OV3): net worth history is rebuilt from transactions, so there is no market component to explain.
- Net worth by account type (AC1): no per-account balance history is exposed by the stores.
- Interest earned vs paid (AC4): the data has no interest-paid transactions.
- Quarter over quarter deltas (RP2): needs a prior quarter's figures in the report contract.
- Break-even month (LE6) and raise impact (IN4): need new simulator inputs.
- Contributions vs growth (IV2): cost basis against value is just the existing Total Return.
- Dividend calendar (IV3) and free-trial guard (SU4): feasible but low payoff on the demo data (no trial pattern exists to show).

## Docs still to write when phase 2 is finished

- `docs/DECISIONS.md`: a "Dashboard enhancements, phase 2" section. Include the choices above (allocation targets on the spending profile, PATCH not PUT, the mocked score rule, mortgage left out of payoff, goal funding ignores growth and interest, the demo-token allowlist entry for the what-if).
- `docs/workstreams/dashboard-enhancements.md`: a "Phase 2 result" table like phase 1's, and update its Status line.
- `apps/api/AGENTS.md`: list `routes/planning.ts` and `spendingContext`. `packages/math-core/AGENTS.md`: add `planning.ts`. `packages/contracts/AGENTS.md`: add `planning.ts`. `apps/web/AGENTS.md`: any new component folder or convention.
- Fix one wrong comment: in `packages/contracts/src/planning.ts`, `PayoffPlan.balanceByMonth` says "at the start of each year of the plan". It is **monthly**, month 0 first.

## Gotchas learned the hard way

- **New Tailwind classes may not apply in `next dev`** (especially arbitrary values like `lg:grid-cols-[17rem_1fr]`). `touch apps/web/src/app/globals.css` forces a rebuild.
- **Stale guest session after an API restart.** The API's in-memory store resets, so the browser's guest cookie goes stale. Read-only pages still work (they fall back to the demo token), but pages that write (Goals runs a simulation, Copilot evaluate) fail with "The shared demo token is read-only". Clear the site's cookies and reload.
- **The demo clock.** Until Dec 3 2026 the API's today is Dec 3, whatever the real date. Pages must use dates from the API (`asOf`, `daysAway`), never `new Date()`. A few pages still use the browser clock (new-goal date, Advisor conversation dates, subscription row actions).
- **Shell quirks on this machine.** Heredocs and some multi-line Python one-liners in the Bash tool sometimes fail or are refused by the safety check. What worked: write the file with the editor tool, or write a small `.py` script to the scratchpad and run it. Python rewrites CRLF files with LF, which git reports as noise ("CRLF will be replaced by LF"); it is harmless but widens diffs.
- **"File changed on disk" notices** appear after your own script edits and after other sessions' edits. Read before editing a file you have not read recently.
- **Tests that assume the real clock.** Tests that need a known month set `deps.today = () => "..."`. Without it they run on the demo clock (Dec 3), where the current month has only three days of data.
- **The theme audit.** `npm test` includes a hardcoded-colour audit (`npm run theme:audit -w @finvantage/web`). Use tokens (`var(--series-1)`, `text-accent-ink`, `bg-inset`), not hex.
- **Zod 4 records with enum keys are exhaustive.** `TargetAllocation` requires all five asset classes (zeros allowed).
- **Income vs Spending still draws spending in red** (`SPENDING_BAR = "var(--critical)"` in `income/page.tsx`), against the chart palette decision. Left alone because the palette work was in the same files; worth fixing.

## Rules to keep (from the root `AGENTS.md`)

Every figure is worked out in the API or `math-core`, never in the web app. Probabilities and scores show as ranges with a disclaimer. Mocked values keep `MockedBadge`. Suggestions never move money, and anything that saves waits for a confirm press. Money is integer cents. Interface labels are Title Case; body copy is sentences. Layouts work down to 320px, with 44px touch targets and no reliance on hover. Colour is never the only signal.

## Quick reference

| Need | Where |
| --- | --- |
| Run everything | `npm run check` from the repo root |
| One workspace's tests | `npm test -w @finvantage/api` (or `math-core`, `web`) |
| New figure | function and test in `packages/math-core/src/planning.ts`, schema in `packages/contracts/src/planning.ts`, route entry in `packages/contracts/src/api.ts`, handler in `apps/api/src/routes/planning.ts`, test in `apps/api/src/app.test.ts` |
| Shared charts | `apps/web/src/components/charts` |
| Formatting helpers | `apps/web/src/lib/format.ts` |
| Plan, decisions, design | `docs/workstreams/dashboard-enhancements.md`, `docs/DECISIONS.md`, `docs/design/dashboard-enhancements-design.md` |
