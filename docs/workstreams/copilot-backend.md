# Copilot backend

**Tier:** P0. **Code:** `packages/math-core`, `packages/llm`, `apps/api/src/routes/copilot.ts`. **Guides:** the `AGENTS.md` in each package. **PRD:** sections 6 and 10.

## Scope

The deterministic math core, then LLM card generation with the math-first guardrail and template fallback. You also own the Gemini wrapper that everyone else's model calls go through.

## You have now

The full pipeline, running: simulator, then math core, then card, then event storage. Formulas are naive. Guardrails work and are tested. Gemini is not connected, so all cards are template cards.

## Start here

1. Confirm model names and limits at the Google Cloud table. Implement `GeminiClient.generate` first, since others depend on it.
2. Review each formula in `math-core`. Its `AGENTS.md` lists known problems.
3. Fix the rental scenario: decide how rent relates to current housing.
4. Write the card prompt. Use structured JSON output for the three parts.
5. Build the checkout "Smart Move": a split between checking and a 0% promo card, with a payoff schedule. The demo profile has `acc_promo` for this.
6. Use context caching for the standing financial profile.

## Done means

- Every figure on a card matches the math core exactly.
- Changing the profile data changes the card with no code change.
- Cards are under 60 words, in the Impact, Trade-off, and Smart Move structure.
- If the LLM fails, a template card appears.
- A card arrives within 3 seconds.

## Depends on

`evaluatePurchase` from the simulator, which works now as a stub.
