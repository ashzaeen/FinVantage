# packages/math-core

Every figure on a Copilot card comes from here. Read the root `AGENTS.md` first. Brief: `docs/workstreams/copilot-backend.md`.

`computeCopilotMetrics(snapshot, context, goalImpacts, goals)` is the entry point. It takes the snapshot, the extension's context, the simulator's output, and the goals, and returns `CopilotMetrics`.

`purchaseForSimulator(snapshot, context, goals)` says how a page's price enters the simulator. The route passes its result to `evaluatePurchase`, so the simulator and the card always describe the same purchase.

Assumptions are named constants at the top of `src/index.ts`. The reasoning behind each scenario (rent replaces housing, safe rent, vehicle terms, the split plan, headline choice) is in `docs/DECISIONS.md`.

`src/advisor.ts` holds the Advisor's figures: goal plans, spending cuts, the calculator's parser, loan, growth, and payoff formulas, and `applyScenario`, which turns a what-if scenario into simulator inputs. Its assumptions are named constants at its top.

`src/subscriptions.ts` holds the Subscriptions page's figures: monthly and yearly cost by cadence, totals, merchant normalization and stable ids, the subscription-or-bill rule, duplicate groups, price changes, recent starts, a cancelled charge that kept charging, and savings so far. Plan: `docs/workstreams/subscriptions.md`.

`src/patterns.ts` holds how a month's spending falls across days, weekdays and merchants, and totals for a set of transactions. `src/insights.ts` holds cash runway and savings rate, how reachable assets are, the credit cards overview (interest, utilization, promo countdown), goal milestones and the next payday.

Known limits:

- Subscriptions: duplicate groups match whole words in a merchant name, so an unrelated merchant that shares a word with a listed one ("Peacock Lane Diner") lands in the group. The category list is short and fixed.

- Current housing is the mortgage payment. Someone who rents today has no rent field in the snapshot, so it counts as 0.
- Vehicle total cost includes interest, not insurance or running costs.
- A purchase spends spare cash first: checking above the safety cushion, plus savings no goal is using (spendable savings minus goals' saved amounts). Goals' saved amounts are assumed to sit in savings. An HSA and CDs aren't spare.
- A car purchase does not count toward a "next car" goal.

## Rules

- Pure and deterministic: no I/O, no clock, no LLM.
- Name assumptions as constants at the top of the file. The PRD requires explaining every number, so they must be easy to surface.
- A field that does not apply to a page type is null, not 0.
- Keep the rule of one source: never recompute these figures in `llm`, `apps/web`, or the extension.

```bash
npm test -w @finvantage/math-core
```

`src/planning.ts` holds the planning figures: safe to spend, attention items, health score, goal funding, spending pace, budget suggestions, unusual charges, the mocked credit what-if (`UTILIZATION_SCORE_POINTS`), debt payoff (avalanche and snowball), allocation drift and Copilot impact. Tests in `planning.test.ts`.
