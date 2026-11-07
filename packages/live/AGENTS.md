# packages/live

Pushes updates to the dashboard. Read the root `AGENTS.md` first. Briefs: `docs/workstreams/platform.md`, `docs/workstreams/spacetime.md`.

`LiveBus` has two methods, `publish` and `subscribe`. Routes publish and never know the transport.

- `LIVE_TRANSPORT=sse` is the default and works: an in-process bus read by `GET /v1/live`.
- `LIVE_TRANSPORT=spacetime` is a stub that throws.

## Rules

- Message shapes live in `packages/contracts/src/live.ts`. Every transport carries the same `LiveEvent`.
- The in-process bus only works with one API process. If the API ever scales out, this needs a shared transport.
- Live push is a convenience. A missed message must never lose data, because the stores remain the source of truth.
