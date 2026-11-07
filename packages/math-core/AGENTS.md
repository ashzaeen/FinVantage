# packages/math-core

Every figure on a Copilot card comes from here. Read the root `AGENTS.md` first. Brief: `docs/workstreams/copilot-backend.md`.

`computeCopilotMetrics(snapshot, context, goalImpacts)` is the entry point. It takes the snapshot, the extension's context, and the simulator's output, and returns `CopilotMetrics`.

The current formulas are naive stubs, not reviewed finance. Known problems:

- `safeRentThreshold` is called with 0 for current housing, so all fixed costs count against the new rent. The threshold comes out too low.
- A rental adds to fixed costs. It should usually replace current housing.
- `totalCostOfOwnershipCents` is just the price, with no interest, insurance, or running costs.
- The vehicle scenario assumes a 60-month term with no interest.

## Rules

- Pure and deterministic: no I/O, no clock, no LLM.
- Name assumptions as constants at the top of the file. The PRD requires explaining every number, so they must be easy to surface.
- A field that does not apply to a page type is null, not 0.
- Keep the rule of one source: never recompute these figures in `llm`, `apps/web`, or the extension.

```bash
npm test -w @finvantage/math-core
```
