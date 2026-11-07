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
| Copilot card, advice, quarterly report | `pro` |

Model names come from `GEMINI_MODEL_FLASH` and `GEMINI_MODEL_PRO`. Confirm current names at the Google Cloud sponsor table. Do not hardcode them.

## Rules

- Only `client.ts` may import a provider SDK.
- Pass figures in as fixed inputs. Never ask a model to calculate.
- Every model output is parsed and validated before use, and every call has a fallback. Models fail during demos.
- Run `validateCard` on every LLM card. A failure returns the template card.
- `templateCard` must stay under the word cap and use only math-core figures.

## Working with the mock

`LLM_PROVIDER=mock` is the default, and its `generate` always throws. That is deliberate: callers exercise their fallback paths, so the app works with no key. As a result, the parser reports no match, and cards have `source: "template"`.

`GeminiClient.generate` is a stub. To enable it, add the Gemini SDK to this package, implement that one method, and set `LLM_PROVIDER=gemini`.

Tests inject a fake `LlmClient`. See `src/guardrails.test.ts`.

```bash
npm test -w @finvantage/llm
```
