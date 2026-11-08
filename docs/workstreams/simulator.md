# Life-Event Simulator

**Tier:** P0. **Code:** `packages/simulator`. **Guide:** `packages/simulator/AGENTS.md`. **PRD:** section 5, plus design notes in section 9.

## Scope

The Monte Carlo engine behind the dashboard and the Copilot. Takes balances, income and spending, goals, life events, and what-if values. Returns a probability range and a fan chart per goal.

## You have now

The seeded Monte Carlo engine feeds a dashboard scenario planner. It shows the saved financial baseline, previews monthly-savings and purchase changes, adjusts the timing of each logged life event, and compares each goal's baseline and scenario probability range with a fan chart. A new event can be simulated beside the current plan before it is saved: every goal gets a before/after probability range and projected balance timeline using the same seed and savings assumptions. The Life Simulator page also has a deterministic event planner that compares a chosen event against every current goal, displays two impact charts before the funding-date timeline, and lets users save and reopen named events with their generated results. Named Monte Carlo runs can also be saved, reloaded, and compared.

## Start here

1. Replace `simulate` with a seeded Monte Carlo over monthly steps, with one goal.
2. Add joint funding across goals by priority.
3. Apply life events and all what-if fields.
4. Decide how the probability range is derived, and record it in `docs/DECISIONS.md`.
5. Benchmark at 5,000 paths with three goals against the 2-second target.

## Done means

- Logging a house purchase visibly lowers the range on a linked goal, and the fan widens over time.
- The same seed and inputs give the same output.
- Goals compete for the same dollars.
- What-if results return in under 2 seconds.
- `evaluatePurchase` returns the change in probability and date for the Copilot.
- Saved scenario runs retain their full server-side input/output snapshot. Browser storage keeps only the user's scenario name and what-if settings needed to load the plan again.

Heavy runs must not block the UI. The API is single-process, so watch long synchronous work, and use a worker thread if needed.

## Depends on

`SimulationInputs` from the contracts. Talk to the copilot-backend owner about what `evaluatePurchase` should return.
