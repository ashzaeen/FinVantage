# apps/api: backend

Hono on Node. Read the root `AGENTS.md` first. Brief: `docs/workstreams/platform.md`.

## Layout

| Path | Holds |
| --- | --- |
| `src/server.ts` | Process entry |
| `src/app.ts` | Middleware, auth stub, route registration, error mapping |
| `src/deps.ts` | **All stub-or-real wiring**, from env |
| `src/mount.ts` | Registers a contract route with validation on both sides |
| `src/services.ts` | Shared logic: `loadInputs`, `runSimulation` |
| `src/routes/*.ts` | One file per area, so teams rarely collide |
| `src/advisor/` | The Advisor's brief, its tools, the in-process read client they use, and `eval.ts` (`npm run eval:advisor`) |
| `src/app.test.ts` | End-to-end tests through the real typed client |

## Rules

- Register routes with `mount(app, deps, routes.x, handler)`, so `body` and `query` arrive validated and the response is checked. The SSE stream in `routes/live.ts` is the one exception.
- Keep handlers thin. Math goes in `math-core`, the engine in `simulator`, model calls in `llm`, and storage behind the store interfaces.
- Use `deps.today()` rather than `new Date()` for financial dates, so tests stay repeatable.
- Throw `HttpError` for expected failures. `NotImplementedError` from `@finvantage/data` becomes a 501.
- The Copilot route keeps its order: simulator, math core, LLM. Do not reorder it.

## Auth

`src/app.ts` maps one shared demo token to the demo user. `EventSource` cannot set headers, so the SSE stream also accepts `?token=`. Handlers only read `userId`, so real auth changes that one middleware.

## Testing

```bash
npm test -w @finvantage/api
curl -H "Authorization: Bearer demo-token" localhost:4000/v1/accounts
```

The in-memory store resets on restart, which is also how to reset demo state.
