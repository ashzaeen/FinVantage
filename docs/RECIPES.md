# Recipes

Step-by-step versions of common changes. Finish each with `npm run check`.

## Add or change an endpoint

1. Add the schema in the right file in `packages/contracts/src`, and export it from `index.ts` if it is a new file.
2. Add an entry to `routes` in `packages/contracts/src/api.ts`.
3. Handle it in `apps/api/src/routes/<area>.ts` with `mount(app, deps, routes.yourRoute, handler)`. For a new area, also register it in `apps/api/src/app.ts`.
4. Add a test in `apps/api/src/app.test.ts`.
5. Call it as `api.yourRoute({ body })`. The client method exists automatically.

## Add a dashboard page

1. Create `apps/web/src/app/<route>/page.tsx` as an async server component that calls `api`.
2. Put interactive parts in a `"use client"` file beside it.
3. Add the route to `apps/web/src/lib/nav.ts`.

## Update the dashboard live

```tsx
useLiveEvents((message) => {
  if (message.type === "simulation.updated") router.refresh();
});
```

For a new message type, add it to `LiveEvent` in `packages/contracts/src/live.ts`, then call `deps.live.publish(userId, event)` from the route.

## Add a Copilot site

1. Add a rule to `SITE_RULES` in `apps/extension/src/content/sites.ts`. The selector must hit only the primary listing price or cart total.
2. Make sure the domain is in `manifest.json` under `matches`.
3. Reload the extension and check the page. Live markup changes, so keep the mock pages working.

## Add a Copilot scenario

1. Add the value to `PageType` and `ItemType` in `packages/contracts/src/copilot.ts`.
2. Add a mock page in `apps/extension/mock-pages` and a rule in `sites.ts`.
3. Add any new figures to `CopilotMetrics` and compute them in `packages/math-core`.
4. Add a branch to `templateCard` in `packages/llm/src/copilot-card.ts`, and show the figures in `keyFigures`.

## Add a life-event type

1. Add it to `LifeEventType` and `LIFE_EVENT_LABEL` in `packages/contracts/src/life-event.ts`.
2. Handle it in `packages/simulator` if it needs special treatment.

The form and the parser's supported list both read from `LifeEventType`, so they update on their own.

## Make a model call

1. Add a function in `packages/llm/src`, taking `LlmClient` as its first argument.
2. Call `llm.generate({ tier, system, prompt, jsonSchema })`. Use `flash` for extraction and `pro` for reasoning and writing.
3. Parse and validate the output with a contract schema.
4. Wrap it in `try`/`catch` with a deterministic fallback.
5. Test it with a fake `LlmClient`, as in `src/guardrails.test.ts`.

## Replace a stub with the real thing

1. Find your work with `grep -rn "STUB(<your-slug>)" apps packages`.
2. Keep the exported signature. If it has to change, change the contract first.
3. Remove the `STUB` tag.
4. Keep the fallback or default path working, so that others can still run with no setup.
5. Update the local `AGENTS.md` if it lists the stub as a known gap.

## Wire up a real store

1. Implement every method of the interface in `packages/data/src/tiger` or `src/mongo`.
2. Put the database driver in `packages/data/package.json`.
3. Set `DATA_BACKEND=real` with connection strings in `.env`.
4. Run the `apps/api` tests against it, then load the demo profile through `POST /v1/profile/load-demo`.

## Change the demo data

Edit `packages/data/fixtures/planner.json` and restart the API. Do not change code to change a card.
