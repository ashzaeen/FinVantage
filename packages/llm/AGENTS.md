# packages/llm

All model use, with Gemini as the provider. Read the root `AGENTS.md` first. Brief: `docs/workstreams/copilot-backend.md`.

| File | Holds | Owner |
| --- | --- | --- |
| `src/client.ts` | **The one wrapper.** Mock and Gemini providers | copilot-backend |
| `src/guardrails.ts` | Number check and word cap | copilot-backend |
| `src/copilot-card.ts` | Card generation and template fallback | copilot-backend |
| `src/life-event-parser.ts` | Free-text parsing | life-events |
| `src/advisory.ts` | Advisory Agent | advisory |
| `src/quarterly.ts` | Quarterly report | advisory |

## Routing

| Task | Tier |
| --- | --- |
| Parse a typed life event | `flash` |
| Copilot card, advice, quarterly report | `flash` |

The model name comes from `GEMINI_MODEL_FLASH`. Confirm the current name at the Google Cloud sponsor table. Do not hardcode it.

## Rules

- Only `client.ts` may import a provider SDK.
- Pass figures in as fixed inputs. Never ask a model to calculate.
- Every model output is parsed and validated before use, and every call has a fallback. Models fail during demos.
- Run `validateCard` on every LLM card. A failure returns the template card.
- `templateCard` must stay under the word cap and use only math-core figures.

## Working with the mock

`LLM_PROVIDER=mock` is the default, and its `generate` always throws. That is deliberate: callers exercise their fallback paths, so the app works with no key. As a result, the parser reports no match, and cards have `source: "template"`.

`GeminiClient` calls the Gemini REST API directly with `fetch`, so the package needs no SDK. To turn it on, set these in the root `.env` and restart the API:

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL_FLASH=...
```

The key travels in the `x-goog-api-key` header, never the URL. Pass `jsonSchema` for structured output (ordinary JSON Schema; the client converts it to Gemini's format) and `timeoutMs` when you need an answer fast. Gemini 3 models think by default, which can take more than 15 seconds, so a fast call also needs `thinking: "minimal"`. Every failure (HTTP error, block, empty reply, timeout) throws, so callers fall back. Copilot cards use the configured Flash model with a 2-second timeout and minimal thinking. A card that falls back logs `Copilot card: template used (<reason>)`, and an accepted card is reused for identical inputs.

`chat()` is the multi-turn form with function calling. It takes `messages` and `tools` (JSON Schema parameters), and returns the model's turn with any `functionCalls`. Replay a model turn unchanged: its `raw` parts carry Gemini 3's thought signatures. `chat` is optional on `LlmClient`, so callers must handle a client without it.

`webSearch()` runs Google Search grounding in its own call and returns a summary with sources. It is optional too. Only the query is sent; the Advisor's `web_search` tool checks it for personal details first.

The Advisor (`src/advisory.ts`, `runAdvisorTurn`) runs the tool loop: at most four tool rounds and a 25-second turn budget. `validateGrounded` checks the answer's dollar amounts only, in any common form ("$570", "570 dollars", "28 grand", "28k", "USD 28,000", "twenty-eight thousand dollars"); rounding within 3% passes; plain numbers and percentages are not checked. `validateCard` takes names separately, so a name's digits approve nothing outside the name, and a caution card with plainly approving words (`contradictsVerdict`) uses the template. A failure gets one retry; a second failure keeps the answer minus the sentences holding the bad amount (`withoutSentences`), or else `safeAdvisorAnswer`. Tool inputs are checked exactly with `isGroundedNumber`.

Tests inject a fake `LlmClient`. See `src/guardrails.test.ts` and `src/advisory.test.ts`.

```bash
npm test -w @finvantage/llm
```
