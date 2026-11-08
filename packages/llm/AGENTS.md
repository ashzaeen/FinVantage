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

`GeminiClient.generate` calls the Gemini REST API. Set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL_FLASH` to enable it.
Provider calls time out after 15 seconds so callers can use their deterministic fallback instead of leaving a request open indefinitely.

Tests inject a fake `LlmClient`. See `src/guardrails.test.ts`.

```bash
npm test -w @finvantage/llm
```
