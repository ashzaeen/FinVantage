# Dashboard Enhancements

**Owner:** Ashzaeen (dashboard). **Tier:** P1. **Status:** plan written and decisions D1 to D8 confirmed 2026-11-21. **Phase 0 built 2026-11-23 on the `dash-fixes` branch** (see "Phase 0 result"). **Phase 1 built 2026-11-23 on `dash-quick-wins`** (see "Phase 1 result"). **Phase 2 built 2026-11-23** (see "Phase 2 result"). **Code (planned):** `apps/web/src/app/(app)/*`, `apps/web/src/components/charts`, `packages/math-core/src`, `apps/api/src/routes`, contracts in `packages/contracts/src`. **Source:** the audit and 82 ideas in `docs/design/dashboard-ideas.html`. **Design:** `docs/design/dashboard-enhancements-design.md` and the wireframes in `docs/design/dashboard-enhancements-wireframes.html`.

## Decisions to confirm before step 1

**All eight confirmed on 2026-11-21, each as the recommended answer below.** Commitment is phases 0, 1 and 2 (59 ideas). Phase 3 is picked after phase 2. Phase 4 waits for its own answers.

| # | Question | Recommended answer | Why |
| --- | --- | --- | --- |
| D1 | What does "Spent" mean everywhere? | Money out, **minus** transfers to savings and investing. Debt payments still count as spent. Show **Saved** as its own figure | Overview already says $3,552.56. Spending says $5,902.56. The $2,350 gap is savings. This makes both agree and fixes the "kept 32%" figure on Income |
| D2 | Phases to commit to now | Phases 0, 1 and 2. Pick from phase 3 after seeing phase 2. Phase 4 waits for its own answers | Phases 0 to 2 are 59 of the 82 ideas, need no new data we do not already hold (apart from D4's target allocation), and keep every figure in `math-core` |
| D3 | Alerts (Settings) | In-app only first. No email, no push | The reports email route exists, but an alert system is its own project. In-app alerts feed "Needs Attention Today" for free |
| D4 | Where target allocation lives | A new optional field on the user's profile, with a default of "none set" and a suggested split from age and risk | One small piece of stored data. Without it, drift has nothing to measure against |
| D5 | Credit score what-if | Mocked, shown as a **range** with `MockedBadge`, computed by a documented formula in `math-core` | Rules 7 and 8. A single score number would claim more than a demo can know |
| D6 | Demo dates | Anchor the generated demo to the day the profile loads, not a fixed date | Today the demo shows Dec 3 items on Nov 21, and "Recent Deposits" lists future deposits |
| D7 | Overview card pin and hide (OV7) | Defer to phase 4 | Needs per-user layout storage and is the least tied to a decision |
| D8 | New charts folder | `apps/web/src/components/charts`, with one file per chart type, all reading `chartColors.ts` | Eleven new charts need one shared home, one set of tokens and one accessibility pattern |

## Summary

The audit found three kinds of work:

1. **Fix what disagrees or repeats** (phase 0). Two meanings of spending, a missing card, lists that appear twice, a "Top 10 Expenses" that is mostly transfers, and three tabs that open empty.
2. **Add what we can already show** (phase 1). Thirty-two ideas that read data the stores already hold, with at most a small API addition.
3. **Add what needs a new figure** (phase 2 and 3). Computed in `math-core`, served by the API, drawn by the web app. Then the bigger interactive builds.

Phase 4 is the ideas that need data we do not collect. They are listed so they are not forgotten, and none will be started without an answer.

## Rules check

| Rule | How this plan keeps it |
| --- | --- |
| 1. Math first | Every new figure is a function in `packages/math-core`, returned by the API. The web app only formats. The single place the model is used is Advisor and Reports wording, which already pass the number check |
| 2. The guardrail stays on | No new model calls in this plan. AD1 and AD3 build their chips and prompts from flags in code, not from model text |
| 3. No empty state | Phase 0 puts a worked example on Copilot, Reports and Life Events. Every new card has an empty state written in the design plan |
| 4. Suggest only | Rebalance, budget limits, payoff order and allocation drift all say "consider", name the figure, and change nothing. Anything that saves waits for a button press |
| 5. Extension privacy | `CopilotContext` is not touched. CP5 (per-merchant alerts) is held in phase 4 because it must not add a field the extension sends |
| 6. Secrets on the server | No keys in the web app. No new third-party calls from the browser, including favicons beyond what Accounts already does |
| 7. Ranges | Credit what-if, retirement fan, goal fan and Life Events forecast show ranges through `ProbabilityRange` or a band with a disclaimer nearby |
| 8. Label mocks | Credit what-if, portfolio drift and any investment figure keep `MockedBadge` |
| 9. Confirm before saving | Budget suggestions, goal rebalance, "Save as Goal or Life Event", and target allocation all preview, then save only on Confirm |
| 10. Sandbox only | Unchanged |
| 11. One LLM wrapper | Unchanged |
| 12. Deterministic simulator | Retirement fan, stress test and forecast use the existing seed. Same seed, same bands |

## What exists already

| Piece | Where | Use in this plan |
| --- | --- | --- |
| `getSpendingSummary`, `listBudgets`, `getSpendingBreakdown`, `listTopExpenses`, `getSpendingSplit` | `packages/contracts/src/api.ts`, `apps/api/src/routes/spending.ts` | Base for D1, SP1, SP3, SP6, SP7 |
| `getIncomeSummary` with `nextPaydayOn` | `apps/api/src/routes/income.ts`, `packages/data/src/profile.ts` | IN3, IN1, OV1 and OV2 |
| `listSubscriptions`, `SubscriptionOverview`, flags | `packages/math-core/src/subscriptions.ts` | SU1 to SU5, OV1 |
| `getNetWorth` with `history` | `packages/contracts/src/account.ts` | OV3, AC1 |
| `getInvestments`, `InvestmentsOverview` | `packages/math-core/src/investments.ts` | IV1 to IV6 |
| Life simulator `analyze`, scenarios, PDF export | `apps/api/src/routes/life-simulator.ts` | LE2 to LE5, RP5 |
| `FanChart`, `ProbabilityRange`, `CountUp`, `MockedBadge` | `apps/web/src/components` | Reused, not rewritten |
| `chartColors.ts` and the Indigo Core palette | `apps/web/src/lib/chartColors.ts`, `docs/DECISIONS.md` | Every new chart. Money in teal, money out orange, never spending in red |
| Advisor visuals and `POST /v1/advisory/visuals` | `apps/web/src/app/(app)/advisor/visuals` | Pattern for "the visual asks the API" |

## Shared building blocks (build once, in phase 0 and 1)

| Block | Used by | Notes |
| --- | --- | --- |
| `components/charts/BulletBar` | OV5, AC2, GO1, IV1, CR3, SU6 | One bar, optional target tick and drift band. Accessible name states the figures |
| `components/charts/Sparkline` | SU1, SP2, TX1, IN1 | Step and line variants. No axes. Table view for access |
| `components/charts/Waterfall` | OV3, SU3, IV2, LE6, IN5 | Orange for money out, teal for in, indigo for totals |
| `components/charts/HeatGrid` | TX4, SP5 | Day-by-day grid, intensity from `--series-1` |
| `components/charts/DotCalendar` | OV4, SU2, IV3, CR4, IN3 | Month or 90-day strip with typed dots. Same keyboard model as the date picker |
| `components/charts/BandLine` | LE3, IN2, GO5, IV5 | Line with a range band and disclaimer slot |
| `components/ui/AttentionItem` | OV1, AD3, ST1 | One row: signal, plain sentence, link. Severity by icon and word, not colour alone |
| `components/ui/WhatIfSlider` | CR1, LE4, IN4, AD4 | A slider that asks the API on release and shows the old and new figure |
| `lib/format.ts` additions | All | Compact money, delta with arrow, "n days" phrases. Pure, tested |

## Phase 0: Fix what disagrees or repeats

About 4 to 5 working days. No new design. Ship first, because every later chart depends on one definition of spending.

| Step | Change | Files | Done when |
| --- | --- | --- | --- |
| 0.1 | **D1.** Add `savedCents` and `spentCents` to the spending summary. Spent excludes transfers to savings and investing | `packages/contracts/src/spending.ts`, `apps/api/src/routes/spending.ts`, `packages/math-core` | Overview, Spending, Income and Reports quote the same November figure ($3,552.56 in the demo). Test pins it |
| 0.2 | Overview Credit Cards lists every credit account | `apps/web/src/components/finance/CreditCards.tsx`, `app/page.tsx` | The 0% Promo Card appears on Overview and Credit |
| 0.3 | Remove duplicate lists: Accounts "All bank accounts" directory, Spending Upcoming Bills and Recurring Charges (link to Subscriptions), Overview net worth tiles folded into one | `accounts/AccountsClient.tsx`, `spending/page.tsx`, `app/page.tsx` | Each fact appears once per page. Page still reaches every account detail |
| 0.4 | Changes From Last Month hides unchanged rows and sorts by size of change | `spending/page.tsx` | No "▼ $0" rows |
| 0.5 | `listTopExpenses` gets a `discretionary` option, and Spending uses it | `packages/contracts/src/api.ts`, `routes/spending.ts` | Top 10 leads with Green Grocer and Sunrise Diner, not the savings transfer |
| 0.6 | Budget "usually" uses the median of recent months | `packages/math-core` budgets, `routes/spending.ts` | Shopping no longer shows $992.75 |
| 0.7 | Subscription price flag states old and new amount in the row's units | `math-core/src/subscriptions.ts`, `lib/subscriptions.ts` | City Power & Light's sentence matches its row |
| 0.8 | **D6.** Anchor the demo generator to the load date | `packages/data/src/profile.ts`, `fixtures/planner.json` | Nothing in the demo is dated after today. Recent Transactions and Recent Deposits are in the past |
| 0.9 | Worked examples on empty tabs: Copilot "Try It Now" (CP1), Reports auto-generate on first visit (RP1), Life Events pre-generated example (LE1) | `copilot/CopilotFeed.tsx`, `reports/ReportsClient.tsx`, `life-events/LifeSimulatorClient.tsx` | No tab opens with only a button or a placeholder sentence |
| 0.10 | Goals: collapse an empty Achieved column; replace the "97% to 98%" range with "On track" when the gap is under 3 points | `goals/GoalsClient.tsx`, `components/finance/GoalCard.tsx` | Rule 7 still holds. The range remains in the detail view |
| 0.11 | Overview: drop the Accounts count tile; Recent Transactions shows category and account in place of the Income and Expense pill | `app/page.tsx` | Fewer tiles, more information per row |
| 0.12 | Record D1, D6 and the removed cards in `docs/DECISIONS.md` and update `apps/web/AGENTS.md` | `docs/DECISIONS.md`, `apps/web/AGENTS.md` | Next agent finds the new definition of Spent |

### Phase 0 result

All twelve steps are done except the two noted. Recorded in `docs/DECISIONS.md`, "Dashboard enhancements, phase 0".

| Step | Result |
| --- | --- |
| 0.1 | Done. `spentCents` and `savedCents` on `SpendingSummary`. Overview and Spending both say $3,552.56 for November. Test: "spent means the same thing on every tab" |
| 0.2 | Done. Every card is listed. A 0% rate end date shows under the card. The link goes to Credit |
| 0.3 | Done. Accounts directory removed. Spending's two bill lists became one link to Subscriptions. Overview's tiles are now Net Worth (with its parts), Spent, Saved and Investments |
| 0.4 | Done |
| 0.5 | Done. `kind=purchases` on `listTopExpenses`. The card is "Top 10 Purchases" |
| 0.6 | Done. Median of the last three months |
| 0.7 | Done. The sentence names the latest charge and says the row shows the bank's usual amount |
| 0.8 | **Done a different way than planned.** The clock, not the data: `deps.today()` is never earlier than `DEMO_DATA_ENDS_ON` (2026-12-03). Regenerating broke tests pinned to Dec 3 and might not match the pitch footage. Side effect: until Dec 3 the app's "this month" is December with three days of data |
| 0.9 | Done. Reports generate on first visit, Copilot has Try It Now and Try an Example, Life Events opens on an example |
| 0.10 | **Partly.** "On track" now leads a range of 90% or more. The Achieved column stays, because it is a drop target |
| 0.11 | Done |
| 0.12 | Done |

## Phase 1: Quick wins on data we hold

About 8 to 10 working days. Mostly web work, each with at most one small read added to the API.

| Idea | Tab | What to build | API change |
| --- | --- | --- | --- |
| OV5 Cash Runway | Overview | `BulletBar` of liquid cash against 3 and 6 months of spending | `runwayMonths` on a new `GET /v1/overview/insights` (see phase 2) or computed in `getNetWorth` meanwhile |
| OV6 Savings Rate Ring | Overview | Ring with 6-month trend | `savedCents` from 0.1 |
| AD1 "Using" chips | Advisor | Chips from the tool calls the reply already made | None. Reads tool names from the chat response |
| AD3 Prompts from your data | Advisor | Starter prompts built from budget, subscription and goal flags | Reads existing endpoints server-side |
| SU1 Price history | Subscriptions | `Sparkline` per row | Add `priceHistory` to `SubscriptionDetail` |
| SU2 Renewal strip | Subscriptions | `DotCalendar`, 90 days | None |
| SU3 What cutting flags saves | Subscriptions | `Waterfall` of yearly cost | One figure per flag in the overview |
| SU5 Category donut | Subscriptions | `CategoryPie` reuse | None |
| RP4 Wins timeline | Reports | Milestones found in the report's own figures | None |
| RP5 Share as PDF | Reports | Reuse the life-simulator PDF route's approach | `POST /v1/reports/quarterly/:id/pdf` |
| AC2 Liquidity ladder | Accounts | `BulletBar`: now, 30 days, locked | Add `liquidity` to `getNetWorth` |
| AC5 Stale account flag | Accounts | Badge on manual accounts not updated in 30 days | `updatedAt` on `Account` if missing |
| TX1 Filter summary | Transactions | In, out, net, month bars for the current filter | Computed from the loaded list client-side is **not** allowed (no figures in web). Add `GET /v1/transactions/summary` |
| TX3 Merchant leaderboard | Transactions | Ranked bars | Same endpoint |
| TX4 Spending heat calendar | Transactions | `HeatGrid` | Same endpoint |
| TX6 Export CSV | Transactions | Download the filtered rows | `GET /v1/transactions/export` |
| GO3 Milestone ladder | Goals | 25, 50, 75% marks with dates | Dates from the simulator in `listGoals` |
| IN1 Income sources over time | Income | Stacked months by source | Add `sources` to `IncomeSummary` |
| IN3 Next payday countdown | Income | Days and amount | `nextPaydayOn` already exists |
| SP2 Category trends | Spending | `Sparkline` per category row | `monthlyByCategory` on the summary |
| SP4 Merchant concentration | Spending | Donut of top 5 | From `transactions/summary` |
| SP5 No-spend streak | Spending | `HeatGrid` with streak | From `transactions/summary` |
| SP7 Weekday vs weekend | Spending | Two bars | From `transactions/summary` |
| IV4 Concentration alert | Investments | Flag any holding over 10% | `concentration` on `InvestmentsOverview` |
| IV6 Tax-advantaged mix | Investments | Stacked bar by account type | `accountMix` on `InvestmentsOverview` |
| CR3 Promo countdown | Credit | Days and payment to clear in time | `promoRateEndsOn` exists on `Account` |
| CR4 Due date strip | Credit | `DotCalendar` | `nextPaymentDueOn` exists on `Account` |
| CR5 Monthly interest cost | Credit | Bars per card | `monthlyInterestCents` per card |
| CR6 Personal factor cards | Credit | Each factor tied to a real figure | Add figures to `getCreditScore` |
| ST3 Privacy Center | Settings | Shows the four fields the extension sends | None. Static, tested against `CopilotContext` |
| ST4 Linked bank health | Settings | Last sync and status | `listBankItems` has it |
| ST6 Appearance | Settings | Theme and number format | None. Stored in the browser |

Exit check for the phase: every card has a loading, empty and error state from the design plan, and `npm run check` passes.

### Phase 1 result

29 of the 32 are done, and 3 need data we do not keep. Recorded in `docs/DECISIONS.md`, "Dashboard enhancements, phase 1".

| Tab | Built |
| --- | --- |
| Overview | Cash Runway and Savings Rate (OV5, OV6), from `GET /v1/overview/insights` |
| Advisor | Prompts from your data (AD3). AD1 already existed: answers show their sources as citations |
| Subscriptions | Price line per subscription (SU1), a calendar beside Upcoming Charges (SU2), What Acting on Flags Could Save (SU3), Where Subscriptions Go (SU5). The page now uses the API's date |
| Reports | RP5 already existed (Download PDF). **RP4 not built**: a wins timeline needs dated milestones, and goal balances have no history |
| Accounts | How Reachable Is Your Money (AC2). **AC5 not built**: accounts keep no last-updated time |
| Transactions | A summary bar that follows the filter (TX1), Spending Patterns with top merchants (TX3) and a day-by-day calendar (TX4), Export CSV (TX6) |
| Goals | Quarter marks on each goal, and "On track" ahead of high ranges (GO3) |
| Income | Income Sources Over Time (IN1) and Next Payday (IN3) |
| Spending | Six-month lines per category (SP2), and the Spending Patterns card: merchant concentration (SP4), no-spend streak (SP5), weekday against weekend (SP7) |
| Investments | Biggest Holdings (IV4) and Where the Money Sits (IV6) |
| Credit | Cards at a Glance with promo countdown (CR3), due-date calendar (CR4) and monthly interest (CR5); factors now from the API (CR6) |
| Settings | Privacy Center (ST3). ST6 already existed (the dark-mode Appearance card). **ST4 not built**: bank items keep no last-sync time |

New API: `GET /v1/overview/insights`, `GET /v1/credit/cards`, `GET /v1/goals/milestones`, `GET /v1/spending/patterns`, `POST /v1/transactions/summary`; additive fields on the spending summary, income summary, net worth, subscriptions and investments. Each new figure has a unit test in `math-core`, and each new route has a test in `apps/api/src/app.test.ts`.

### Phase 2 result

Built, with the backend first and the UI after. Recorded in `docs/DECISIONS.md`, "Dashboard enhancements, phase 2".

| Tab | Built |
| --- | --- |
| Overview | Needs Attention strip, Safe to Spend, Financial Health (OV1, OV2, RP3) |
| Goals | Monthly need and median finish on each card, and a funding summary (GO1, GO5) |
| Spending | Spending Pace chart (SP1) and Suggested Budgets with Add This Limit (SP6) |
| Transactions | "2.4x usual here" chip on unusual charges (TX2) |
| Credit | What If You Paid Down a Card (CR1) and Paying Down Debt (CR2) |
| Accounts | Paying Down Debt, the same card (AC3) |
| Investments | Allocation Drift with presets and Save Targets (IV1) |
| Income | Income That Moves (IN2) |
| Copilot | Copilot Impact tiles (CP2) |
| Reports | Financial Health card (RP3) |

New API: `GET /v1/overview/safe-to-spend`, `/v1/overview/attention`, `/v1/health-score`, `/v1/goals/funding`, `/v1/spending/pace`, `/v1/budgets/suggestions`, `/v1/transactions/unusual`, `POST /v1/credit/what-if`, `GET /v1/debt/payoff`, `/v1/investments/drift`, `PATCH /v1/investments/targets`, `GET /v1/copilot/impact`, and `variability` on the income summary. The web UI has not been looked at in a browser yet.

## Phase 2: New figures in math-core

About 15 to 20 working days. Each idea needs a pure function, a contract, a route and a test. Do them in this order, because later ones reuse earlier ones.

| Order | Figure | Ideas it feeds | Function (new, in `packages/math-core/src`) | Endpoint |
| --- | --- | --- | --- | --- |
| 1 | Safe to spend, runway, savings rate | OV2, OV5, OV6 | `safeToSpend(...)` in `overview.ts` | `GET /v1/overview/insights` |
| 2 | Attention feed | OV1, AD3, ST1 later | `attentionItems(...)` ranking existing flags | Same endpoint |
| 3 | Net worth drivers | OV3, AC1 | `netWorthDrivers(...)` | Same endpoint, `?period=month` |
| 4 | Goal funding | GO1, GO5 | `goalFunding(...)`: monthly needed against contributing | `GET /v1/goals/funding` |
| 5 | Debt payoff | AC3, CR2 | `debtPayoff(strategy)` for avalanche and snowball | `GET /v1/debt/payoff` |
| 6 | Utilization what-if | CR1 | `utilizationWhatIf(...)` with a score **range** | `POST /v1/credit/what-if` |
| 7 | Allocation drift | IV1 | `allocationDrift(targets)` and the target setting (D4) | `GET /v1/investments/drift`, `PUT /v1/investments/targets` |
| 8 | Return split | IV2 | `contributionsVsGrowth(...)` | On `InvestmentsOverview` |
| 9 | Dividend schedule | IV3 | `dividendSchedule(...)` from dividend history | On `InvestmentsOverview` |
| 10 | Health score | RP3, OV | `healthScore(...)`: four parts and a total | `GET /v1/health-score`, also in the quarterly report |
| 11 | Quarter over quarter | RP2 | `quarterDeltas(...)` | On `QuarterlyReport` |
| 12 | Budget suggestions | SP6 | `suggestBudgets(...)` from 3-month medians | `GET /v1/budgets/suggestions`, applied through the existing `setBudget` |
| 13 | Spend pace | SP1 | `spendPace(...)`: cumulative this month, last month, budget | `GET /v1/spending/pace` |
| 14 | Unusual charges | TX2 | `unusualCharges(...)` against merchant history | On `transactions/summary` |
| 15 | Income variability and raise impact | IN2, IN4 | `incomeBand(...)`, `raiseImpact(...)` | `GET /v1/income/summary` extended, `POST /v1/income/raise-impact` |
| 16 | Interest earned and paid | AC4 | `interestFlows(...)` | On `getNetWorth` |
| 17 | Free-trial detection | SU4 | `trialConversions(...)` in `subscriptions.ts` | On `SubscriptionOverview` flags |
| 18 | Copilot impact | CP2 | `copilotImpact(...)` from stored events | `GET /v1/copilot/impact` |
| 19 | Break-even month | LE6 | Add to the life simulator analysis | On `analyze` |

Per figure, the recipe is `docs/RECIPES.md`, "Add or change an endpoint": schema, route entry, handler, test in `apps/api/src/app.test.ts`, then `api.yourRoute()` in the page. Each function gets a unit test in `math-core` and a determinism test where it uses the simulator.

## Phase 3: Bigger interactive builds

About 15 to 20 working days. Pick from this list after phase 2. Each needs its design in the wireframes.

| Idea | What it is | Why it is big |
| --- | --- | --- |
| OV4 Money Calendar | Thirty days of paydays, bills, due dates, plus projected balance | Combines three data sources and a projection line |
| AD2 Save as goal or life event | A button under a visual that drafts, previews and waits for Confirm | Touches the parse-and-confirm flow (rule 9) |
| AD4 Two scenarios in chat | Two visuals in one card with the difference | Chat message layout and API for paired visuals |
| AD5 Tap a number to see its math | A drawer with inputs, formula name and data date | Needs every figure to carry its inputs through the API |
| LE2 Compare two events | Side by side funding dates and monthly cost | New layout in a form-heavy tab |
| LE3 Monthly cash forecast | 24 months with a range band | New simulator output |
| LE4 Stress test | Switches for income drop or rent rise | New simulator inputs |
| LE5 All events timeline | Saved events as lanes across five years | New chart |
| TX5 Bulk edit and split | Select rows, recategorize, split one row | Selection model, mobile layout, write path |
| GO2 Where savings go | Stack of monthly saving by goal | Needs the priority model |
| GO4 Suggested rebalance | "Move $60 a month from Kitchen to House" | Search over goal plans in math-core |
| IV5 Retirement fan | Range chart at 65 from the simulator | New inputs: retirement age, contribution |
| ST2 Export and delete my data | Export CSV and JSON, confirmed delete | Surfaces the existing delete reducer, needs confirm flow |

### Phase 3 result (first group)

| Idea | Status |
| --- | --- |
| OV4 Money Calendar | Built on Overview: `GET /v1/overview/calendar`, a dot calendar and a projected checking line |
| ST2 Export and delete my data | **Export built** on Settings. **Delete not built**: needs a delete method on every store and a confirm flow |
| LE5 All events timeline | Built on Life Events |
| LE2 Compare two events | Built on Life Events |
| AD2 Save as goal or life event | Save as Goal on the goal planner now previews and waits for Confirm. Life-event drafts already did |
| LE3 Monthly cash forecast | Built on Life Events: 24 months as a range band, from `forecastCash` |
| LE4 Stress test | Built beside it: Income Down 20% and Rent Up 10%, with goal odds before and after |
| IV5 Retirement fan | Built on Investments: `projectRetirement`, mocked, with a stated simplification |
| TX5 Bulk edit and split | Built on Transactions: Select mode, move many, split one purchase in two |
| AD4 Two scenarios in chat | Built: Compare Two Scenarios on every Advisor visual, with a difference table |
| AD5 Tap a number | Built for figures that have a calculation behind them. Others stay plain text |
| GO2 Where savings go | Built on Goals: `goalAllocation` in `math-core`, a stacked bar by goal and the goals that need more |
| GO4 Suggested rebalance | Built beside it: a reorder that funds a short fixed-date goal, with its cost, applied only on Confirm |

## Phase 4: Needs data or a decision we do not have

**On hold since 2026-11-23, by the owner: treated as minor quality-of-life features.** Not started without an answer. Listed so they are tracked.

| Idea | Missing | Question to answer |
| --- | --- | --- |
| OV7 Pin and hide cards | Per-user layout storage | Worth it before real users? |
| CP3 Bought or skipped log | A way to mark outcomes, and a store | Does the extension report purchases? It must not (rule 5) |
| CP4 Wishlist with cool-off | A wishlist store and reminders | Reminders need a delivery channel (D3) |
| CP5 Per-merchant alerts | A rule store the extension reads | Must not add fields the extension sends |
| SU6 Is it worth it | Usage input from the user | Is a self-reported rating enough? |
| GO6 Which account holds a goal | A goal-to-account link | Does progress then read the account balance? |
| IN5 Gross to net | Tax, retirement and benefit inputs | We have none. Needs a profile form or a payroll source |
| IV7 Fee drag | Expense ratios per fund | A reference table or a market-data field |
| ST1 Alert preferences | A preference store and delivery | See D3 |
| ST5 Profile that tunes the math | Risk, filing status, retirement age | Which of these does the simulator actually read? |

## Idea tracker: all 82

Phase column is where the idea lives. "P0" means it is covered by a phase 0 step.

| ID | Idea | Phase | ID | Idea | Phase |
| --- | --- | --- | --- | --- | --- |
| OV1 | Needs Attention Today | 2 | IN1 | Income sources over time | 1 |
| OV2 | Safe to Spend | 2 | IN2 | Freelance range band | 2 |
| OV3 | What moved net worth | 2 | IN3 | Next payday countdown | 1 |
| OV4 | Money Calendar | 3 | IN4 | Raise impact | 2 |
| OV5 | Cash Runway | 1 | IN5 | Gross to net | 4 |
| OV6 | Savings rate ring | 1 | SP1 | Daily pace line | 2 |
| OV7 | Pin and hide cards | 4 | SP2 | Category trends | 1 |
| AD1 | "Using" chips | 1 | SP3 | Discretionary top purchases | 0 |
| AD2 | Save as goal or event | 3 | SP4 | Merchant concentration | 1 |
| AD3 | Prompts from your data | 1 | SP5 | No-spend streak | 1 |
| AD4 | Two scenarios in chat | 3 | SP6 | Suggested budget limits | 2 |
| AD5 | Tap a number for its math | 3 | SP7 | Weekday vs weekend | 1 |
| CP1 | Try It Now | 0 | IV1 | Target vs actual allocation | 2 |
| CP2 | Impact summary | 2 | IV2 | Contributions vs growth | 2 |
| CP3 | Bought or skipped log | 4 | IV3 | Dividend calendar | 2 |
| CP4 | Wishlist with cool-off | 4 | IV4 | Concentration alert | 1 |
| CP5 | Per-merchant alerts | 4 | IV5 | Retirement readiness fan | 3 |
| LE1 | Pre-generated example | 0 | IV6 | Tax-advantaged mix | 1 |
| LE2 | Compare two events | 3 | IV7 | Fee drag | 4 |
| LE3 | Monthly cash forecast | 3 | CR1 | Utilization what-if | 2 |
| LE4 | Stress test | 3 | CR2 | Payoff order planner | 2 |
| LE5 | All events timeline | 3 | CR3 | Promo countdown | 1 |
| LE6 | Break-even month | 2 | CR4 | Due date strip | 1 |
| SU1 | Price history | 1 | CR5 | Monthly interest cost | 1 |
| SU2 | Renewal strip | 1 | CR6 | Personal factor cards | 1 |
| SU3 | What cutting flags saves | 1 | ST1 | Alert preferences | 4 |
| SU4 | Free trial guard | 2 | ST2 | Export and delete | 3 |
| SU5 | Category donut | 1 | ST3 | Privacy Center | 1 |
| SU6 | Is it worth it | 4 | ST4 | Linked bank health | 1 |
| RP1 | Auto-generate | 0 | ST5 | Profile tunes the math | 4 |
| RP2 | Quarter over quarter | 2 | ST6 | Appearance | 1 |
| RP3 | Health score | 2 | AC1 | Net worth by account type | 2 |
| RP4 | Wins timeline | 1 | AC2 | Liquidity ladder | 1 |
| RP5 | Share as PDF | 1 | AC3 | Debt payoff race | 2 |
| TX1 | Filter summary bar | 1 | AC4 | Interest earned vs paid | 2 |
| TX2 | Unusual charge flags | 2 | AC5 | Stale account flag | 1 |
| TX3 | Merchant leaderboard | 1 | GO1 | Monthly needed vs contributing | 2 |
| TX4 | Spending heat calendar | 1 | GO2 | Where savings go | 3 |
| TX5 | Bulk edit and split | 3 | GO3 | Milestone ladder | 1 |
| TX6 | Export CSV | 1 | GO4 | Suggested rebalance | 3 |
| | | | GO5 | Projection fan in card | 2 |
| | | | GO6 | Which account holds it | 4 |

Phase 0 also covers audit findings that are not ideas (steps 0.1 to 0.11).

## Contract and API additions, in one place

Additive only. Run `npm run check` after each.

| Addition | Contract file | Phase |
| --- | --- | --- |
| `savedCents`, `spentCents` on `SpendingSummary` | `spending.ts` | 0 |
| `discretionary` option on `listTopExpenses`, `monthlyByCategory` | `api.ts`, `spending.ts` | 0, 1 |
| `GET /v1/transactions/summary`, `GET /v1/transactions/export` | new `transaction-insights.ts` | 1 |
| `priceHistory` on `SubscriptionDetail`, per-flag yearly saving | `subscription.ts` | 1 |
| `liquidity` on `NetWorth`, `updatedAt` on `Account` | `account.ts` | 1 |
| `sources` on `IncomeSummary` | `spending.ts` or `income` file | 1 |
| `concentration`, `accountMix` on `InvestmentsOverview` | `investments.ts` | 1 |
| Personal figures on `CreditScore` | `account.ts` | 1 |
| `GET /v1/overview/insights` | new `overview.ts` | 2 |
| `GET /v1/goals/funding` | `goal.ts` | 2 |
| `GET /v1/debt/payoff`, `POST /v1/credit/what-if` | new `debt.ts` | 2 |
| `GET /v1/investments/drift`, `PUT /v1/investments/targets` | `investments.ts` | 2 |
| `GET /v1/health-score`, quarter deltas | new `health.ts`, `advisory.ts` | 2 |
| `GET /v1/budgets/suggestions`, `GET /v1/spending/pace` | `spending.ts` | 2 |
| `POST /v1/income/raise-impact` | `spending.ts` or `income` file | 2 |
| `GET /v1/copilot/impact` | `copilot.ts` | 2 |

Each new route goes in `apps/api/src/routes/<area>.ts`, with a test in `apps/api/src/app.test.ts`. A new dashboard route would also need the `matcher` in `apps/web/src/proxy.ts`. None of these add a page, so that rule does not apply here.

## Testing and checks

| What | How |
| --- | --- |
| Every new figure | Unit test in `packages/math-core` with demo-profile numbers pinned |
| Same seed, same output | Determinism test wherever the simulator is used |
| Every new endpoint | A test in `apps/api/src/app.test.ts` through the real typed client |
| Consistency | One test that asks Overview, Spending, Income and Reports for November and asserts the same Spent figure |
| UI | Run the app. Check 320, 390, 768 and 1440px, light and dark, and with reduced motion on. Tests do not cover the web app |
| Access | Each chart has a table view or an accessible summary, keyboard reachable, with colour never the only signal |
| Final | `npm run check` from the root before calling any phase done |

## Order of work and rough size

| Phase | Ideas | Working days | Branch |
| --- | --- | --- | --- |
| 0 Fix what disagrees | 4 ideas, 11 audit fixes | 4 to 5 | `dash-fixes` |
| 1 Quick wins | 32 | 8 to 10 | `dash-quick-wins` |
| 2 New figures | 23 | 15 to 20 | `dash-figures` |
| 3 Bigger builds | 13 | 15 to 20 | one per idea |
| 4 Needs a decision | 10 | not sized | after answers |

Sizes are estimates for one person. The tracker above totals 82 ideas: 4 + 32 + 23 + 13 + 10.

## Risks

| Risk | What we do |
| --- | --- |
| Changing "Spent" breaks the budget, split and report maths that assume the old total | Step 0.1 includes a search of every caller and one cross-tab test |
| Eleven new charts drift in look and behaviour | Shared blocks first, one `chartColors.ts`, one table-view pattern |
| New figures disagree with each other | All come from `math-core` and share inputs. The consistency test covers the headline ones |
| The tabs get busier, not clearer | The design plan sets a card budget per tab. Phase 0 removes before phase 1 adds |
| Phase 3 grows | Each is its own branch and can ship or stop alone |

## What is a stub when this ships

Credit score and its what-if (mocked, as a range). Portfolio and market figures (mocked). Anything in phase 4. The Advisor wording stays model-written but number-checked. Alerts are in-app only.

## Before calling a phase done

- `npm run check` passes.
- You ran the app and looked at every changed tab at phone and desktop width.
- `apps/web/AGENTS.md` lists the new `components/charts` folder and any new convention.
- `docs/DECISIONS.md` has D1 to D8 once answered.
- The tracker above has the phase marked done.
