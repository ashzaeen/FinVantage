# Life-Event Simulator

**Tier:** P0. **Code:** `packages/simulator`. **Guide:** `packages/simulator/AGENTS.md`. **PRD:** section 5, plus design notes in section 9.

## Scope

The Monte Carlo engine behind the dashboard and the Copilot. Takes balances, income and spending, goals, life events, and what-if values. Returns a probability range and a fan chart per goal.

## You have now

A closed-form stub with the real signatures, tested against the acceptance criteria. Nothing else needs to change when you swap the body.

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

Heavy runs must not block the UI. The API is single-process, so watch long synchronous work, and use a worker thread if needed.

## Depends on

`SimulationInputs` from the contracts. Talk to the copilot-backend owner about what `evaluatePurchase` should return.
