# Copilot and simulator: status

Owner: Aram. Covers the Life-Event Simulator, the Copilot backend (math core and card), and the Copilot extension. Read `AGENTS.md` first; every decision and its reason is in `docs/DECISIONS.md`.

## Done

| Area | What works | Where |
| --- | --- | --- |
| Simulator | Seeded Monte Carlo, 5,000 paths, goals funded jointly by priority, life events and every what-if field, probability range from assumption terciles, fan chart that widens over time. A Copilot evaluation takes about 0.6 s | `packages/simulator` |
| Math core | Rent replaces current housing, safe rent, vehicle financing with interest, checkout split onto the 0% promo card, credit card payments, ranked alternatives, headline goal, plain status words, verdict (caution, good, neutral) | `packages/math-core` |
| Card | Goal-first template card for every page type and verdict, Gemini prompt with structured output, guardrail that rejects invented numbers or a card that skips the headline goal | `packages/llm/src/copilot-card.ts` |
| Extension | Detection on all demo pages, card colored by verdict, updates live when the page's price changes, dismiss and snooze per page, popup with "Reset dismissed cards", rejects non-USD prices | `apps/extension` |
| Demo sites | Start page with bookmarks, Circuit & Co. store (12 products, categories, search, cart, checkout), Hearth Rentals, Meridian Motors, Demo Bank card payment, two edge-case pages | `apps/extension/mock-pages` |
| Demo profile | Added a "Japan trip" goal (priority 2) | `packages/data/fixtures/planner.json` |

Tests: `npm run check` passes (simulator 11, math core 24, card 14, extension 3, plus the API suite).

## Not done

- **Gemini is built but not tested live.** `GeminiClient` in `packages/llm/src/client.ts` is done and tested with a simulated Gemini. To turn it on, fill in the Gemini lines in `.env` (see `packages/llm/AGENTS.md`) and restart. Then open a demo page and check the card: AI-written cards come back with `source: "llm"`. If cards still say `template`, the API terminal shows why.
- **"Open full simulation"** links to `/simulator?copilotEvent=<id>`. Check with the dashboard owner that the page applies the purchase.
- **Live-site rules** (Zillow, Best Buy and others) are not written. The demo runs on the mock pages, as the PRD says.
- The extension's on/off and snooze settings live in `chrome.storage` only, not in the API.

## Shared changes to tell the team about

- `packages/contracts/src/copilot.ts`: new page type `debt_payment`, item type `credit_card_payment`, and new `CopilotMetrics` fields (`headline`, `verdict`, `splitPlan`, `debtPayment`, `alternatives`, `vehicle`, and others). All additive.
- `packages/contracts/src/simulation.ts`: `GoalImpact` gains `probabilityLowAfter` and `probabilityHighAfter`.
- `packages/data/fixtures/planner.json`: the Japan trip goal shifts the other goals' priorities down by one.

## Running the demo

1. `npm run dev` once, in one terminal. If you see `EADDRINUSE`, an old copy is still running: `lsof -ti :3000,:4000,:4100 | xargs kill`, then start again.
2. Load `apps/extension/dist` unpacked in `chrome://extensions`, and click reload there after extension changes.
3. Open http://localhost:4100.

Suggested flow, about 3 minutes:

1. Circuit & Co.: $15 earbuds (green, on track), then the $1,499 Arc 14 laptop (Japan trip at risk, with the split-payment fix).
2. "Open full simulation" to hand off to the dashboard.
3. Hearth Rentals: $1,950 a month (emergency fund out of reach, safe rent $1,200).
4. Demo Bank: pay the $860 balance (green, $198 a year saved), then switch to the $35 minimum to show the card change live.
5. Meridian Motors if there is time.

If a card was closed during practice, use the extension popup's "Reset dismissed cards" and refresh.
