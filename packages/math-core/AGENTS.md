# packages/math-core

Every figure on a Copilot card comes from here. Read the root `AGENTS.md` first. Brief: `docs/workstreams/copilot-backend.md`.

`computeCopilotMetrics(snapshot, context, goalImpacts, goals)` is the entry point. It takes the snapshot, the extension's context, the simulator's output, and the goals, and returns `CopilotMetrics`.

`purchaseForSimulator(snapshot, context)` says how a page's price enters the simulator. The route passes its result to `evaluatePurchase`, so the simulator and the card always describe the same purchase.

Assumptions are named constants at the top of `src/index.ts`. The reasoning behind each scenario (rent replaces housing, safe rent, vehicle terms, the split plan, headline choice) is in `docs/DECISIONS.md`.

Known limits:

- Current housing is the mortgage payment. Someone who rents today has no rent field in the snapshot, so it counts as 0.
- Vehicle total cost includes interest, not insurance or running costs.
- A purchase spends spare checking (above the safety cushion) before goal savings. Savings balances are not counted as spare, because goals are funded from them.
- A car purchase does not count toward a "next car" goal.

## Rules

- Pure and deterministic: no I/O, no clock, no LLM.
- Name assumptions as constants at the top of the file. The PRD requires explaining every number, so they must be easy to surface.
- A field that does not apply to a page type is null, not 0.
- Keep the rule of one source: never recompute these figures in `llm`, `apps/web`, or the extension.

```bash
npm test -w @finvantage/math-core
```
