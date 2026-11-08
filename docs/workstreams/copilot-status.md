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

- **Gemini writes the Copilot cards** (`LLM_PROVIDER=gemini`, `gemini-3-flash-preview`, minimal thinking), about 1.5 s per card. Any failure (error, timeout, rate limit, or a reply the guardrail rejects) shows the template card, and the API terminal logs `Copilot card: template used (<reason>)`. An accepted card is reused for identical inputs, so reopening a page costs no request. The key is free tier (5 requests a minute, shared with the quarterly report), so a fast run of new pages can still hit the limit and show template cards. The deployed API stays on template cards until `LLM_PROVIDER`, `GEMINI_API_KEY`, and `GEMINI_MODEL_FLASH` are set in its Vercel project. To turn Gemini off, set `LLM_PROVIDER=mock` and restart.
- **"Open full simulation"** links to `/simulator?copilotEvent=<id>`. Check with the dashboard owner that the page applies the purchase.
- **Live sites:** Amazon product pages work (rule in `apps/extension/src/content/sites.ts`, checked live on 2026-11-07 on 8 products, including decoy prices and switching options). Amazon cart and checkout, and the other sites (Zillow, Best Buy and others), are not written. The main demo still runs on the mock pages, as the PRD says. Amazon changes its markup, so open one product page on demo day before presenting.
- **Gemini writes every card** with a paid key (`COPILOT_GEMINI_MERCHANTS` unset). Setting it to `Amazon` limits Gemini to Amazon again. A card that fails the number check, uses jargon, or shows a negative dollar amount falls back to the template.
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

1. Circuit & Co.: $15 earbuds (green, "Looks good"), then the $1,499 Arc 14 laptop (amber "Heads up": it dips under the safety cushion and nudges the House down payment, fixed by the 0% card split), then the $3,299 Arc 16 Pro (red "Warning": the Japan trip goes from on track to unlikely, and the card suggests a cheaper option, not financing).
2. "See the full picture" to hand off to the dashboard.
3. Hearth Rentals: $1,950 a month (red: emergency fund out of reach, rent you can afford $1,200).
4. Demo Bank: pay the $860 balance (green, $198 a year saved), then switch to the $35 minimum to show the card change live.
5. Amazon: one real product page, opened once before presenting (Amazon changes its markup).
6. Meridian Motors if there is time.

If a card was closed during practice, use the extension popup's "Reset dismissed cards" and refresh.
