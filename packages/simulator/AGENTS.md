# packages/simulator

The math engine behind the dashboard and the Copilot. Read the root `AGENTS.md` first. Brief: `docs/workstreams/simulator.md`.

`src/index.ts` is a seeded Monte Carlo engine. Its exports are the contract, so keep these signatures:

| Export | Used by |
| --- | --- |
| `simulate(inputs, { seed, paths })` | `POST /v1/simulations`, life events, dashboard |
| `evaluatePurchase(inputs, purchase)` | The Copilot route |
| `diffOutcomes(goals, before, after)` | Run diffs, life-event deltas |

How it works, the named assumptions (`ASSUMPTIONS`), and how the probability range is derived are documented at the top of `src/index.ts` and in `docs/DECISIONS.md`. A Copilot evaluation (two runs at 5,000 paths) takes well under a second; a test enforces the 2-second limit.

## The engine must

- Sample income changes, spending variation, and market returns. Default to 5,000 paths, configurable.
- Simulate all goals jointly, funding by `priorityRank` from one pool. Never run them independently.
- Apply `lifeEvents` and every `whatIf` field, including `eventShifts`.
- Return a probability **range** per goal, and fan chart percentiles that widen over time.
- Use a seeded PRNG, never `Math.random()`. Same seed and inputs must give the same output.
- Return a what-if result in under 2 seconds. Cap paths and cache by input hash if needed.

The range comes from assumption terciles (see `docs/DECISIONS.md`). The UI presents it to users as "60-85% likely", so keep it explainable.

## Rules

- Stay pure: no I/O, no clock, no stores. Take everything through `inputs`, and date from `snapshot.asOf`.
- Keep this package free of LLM calls.
- Do not store runs here. `apps/api/src/services.ts` does that.

## Testing

`src/index.test.ts` encodes the PRD's acceptance criteria. Keep those tests passing on the real engine. Add a benchmark at 5,000 paths with three goals before tuning.

```bash
npm test -w @finvantage/simulator
```
