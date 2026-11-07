# Spacetime live push

**Tier:** Stretch, only if P0 is done and one person owns it. **Code:** `packages/live`. **PRD:** section 3.1.

## Scope

Live push of Copilot events and projection updates to the dashboard, as a `LiveBus` implementation.

## You have now

A `SpacetimeBus` stub, selected with `LIVE_TRANSPORT=spacetime`. The default SSE transport already does this job, so the demo does not depend on this work.

## Start here

1. Confirm the track's rules at the sponsor table.
2. Spike it in the first hours, and drop it quickly if it does not fit.
3. Implement `publish` and `subscribe` on `SpacetimeBus`.
4. If the browser must connect to Spacetime directly, update `useLiveEvents`, without changing its signature.

## Done means

- The dashboard updates through Spacetime, with no route changes.
- `LIVE_TRANSPORT=sse` still works as a fallback.

## Limits

Spacetime stays a push channel. The PRD warns against adding it as a third store, and it shifts server logic into the database. Tiger Data and Atlas remain the systems of record.
