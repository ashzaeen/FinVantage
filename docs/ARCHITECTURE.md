# Architecture

```
Chrome extension ──┐                    ┌───────────────────────┐
  price on page    │                    │ apps/api (Hono)       │──> Tiger Data  (ledger)
                   ├── typed client ──> │  math-core            │──> MongoDB Atlas (documents)
Web app ───────────┘   over HTTPS       │  simulator            │
  dashboard            <── SSE ──────── │  llm                  │──> Gemini (Flash, Pro)
                                        └───────────────────────┘
```

Both clients call one backend. The math core and simulator produce every figure the user sees. The LLM layer only words them.

## Three ideas that shape the repo

**Contracts first.** `packages/contracts` defines every entity and the route table. `mount()` on the server and `createApiClient()` on the client are typed from that table, and both validate at runtime. If a handler drifts from its contract, the API returns a 500 with code `contract_violation` rather than sending bad data.

**Interfaces with stubs behind them.** Each external dependency sits behind an interface with a default that needs no setup. Env variables pick the real one, in one place: `apps/api/src/deps.ts`.

| Interface | Default | Real | Switch |
| --- | --- | --- | --- |
| `LedgerStore` | In memory | Tiger Data | `DATA_BACKEND` |
| `DocumentStore` | In memory | MongoDB Atlas | `DATA_BACKEND` |
| `BankDataProvider` | Synthetic | Plaid sandbox | `BANK_PROVIDER` |
| `LlmClient` | Mock (always fails, so fallbacks run) | Gemini | `LLM_PROVIDER` |
| `LiveBus` | In-process SSE | Spacetime | `LIVE_TRANSPORT` |

**Math first, words last.** See the Copilot flow below.

## Copilot flow

1. The content script matches a rule in `sites.ts` and reads one price element.
2. It sends `CopilotContext` (four fields) to the service worker.
3. The service worker checks on/off, snooze, and dismissal, then calls `POST /v1/copilot/evaluate`.
4. The API builds a snapshot from the stores.
5. `evaluatePurchase` gets goal impact from the simulator.
6. `computeCopilotMetrics` computes every figure.
7. `generateCopilotCard` asks the LLM to word it, then `validateCard` checks it. Any failure returns `templateCard`.
8. The API stores a `CopilotEvent` and publishes it on the `LiveBus`.
9. The overlay shows the card, and the dashboard feed updates live.
10. Dismiss, snooze, and open are sent back to `POST /v1/copilot/events/:id/action`.

Target: card within 3 seconds of page load.

## Simulation flow

- **Slider drag:** `POST /v1/simulations` with `persist: false`. Debounced, and not stored. Target: under 2 seconds.
- **Saved run:** the same route with `persist: true` stores inputs, outputs, priorities, and `previousRunId`, then publishes `simulation.updated`.
- **Diff:** `GET /v1/simulations/:id/diff/:otherId` reads stored runs and does not recalculate.

## Life-event flow

The form and the parser both produce a `LifeEventDraft`. The client shows a confirmation, and only then calls `POST /v1/life-events`. That saves the event, starts a new run, and returns the change in each goal.

## Ports

| Port | Service |
| --- | --- |
| 3000 | Web app |
| 4000 | API |
| 4100 | Extension demo pages |

## Hosting

Web on Vercel, API and simulator on a Vultr instance. The extension needs a public HTTPS endpoint, so Vultr is a real requirement rather than only a sponsor entry. See `infra/README.md`.
