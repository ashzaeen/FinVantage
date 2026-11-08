# FinVantage: guide for coding agents

Read this first. Every app and package also has its own `AGENTS.md` with local rules, so read that before editing there. Requirements live in `docs/PRD.md`, which cites PDF pages and section numbers.

## What this is

A TypeScript npm-workspaces monorepo. A Next.js dashboard and a Chrome extension both call one Hono API. The API uses a deterministic math core and a simulator to produce numbers, and an LLM layer only to word them.

The repo is a running skeleton. **Most logic is a stub by design.** A passing test does not mean a feature is finished.

## Map

| Path | What it is | Runs as |
| --- | --- | --- |
| `packages/contracts` | Zod schemas, types, the API route table, the typed client | Imported by everything |
| `packages/simulator` | Monte Carlo goal engine (stub) | Library |
| `packages/math-core` | Deterministic Copilot figures (stub formulas) | Library |
| `packages/llm` | The single model wrapper, prompts, guardrails, template cards | Library |
| `packages/data` | Store interfaces, in-memory stores, demo profile, Tiger and Atlas stubs, bank providers | Library |
| `packages/live` | Live push interface: SSE default, Spacetime stub | Library |
| `apps/api` | Hono server that wires it all together | Port 4000 |
| `apps/web` | Next.js dashboard | Port 3000 |
| `apps/extension` | Manifest V3 extension and demo pages | Port 4100 for demo pages |
| `apps/spacetime` | SpacetimeDB module: ledger tables and live events. Imports only `spacetimedb` | Maincloud database `finvantage` |
| `docs` | Architecture, recipes, decisions, PRD, workstream briefs | |
| `infra` | Deployment notes: Vercel setup, limits | |

Dependency direction is one way. Never add an import that points back up this list:

```
apps/web, apps/extension  ->  contracts
apps/api                  ->  simulator, math-core, llm, data, live, contracts
simulator, math-core, llm, data, live  ->  contracts
```

The web app and extension never import anything but `contracts`. They reach everything else over HTTP.

## Commands

Run from the repo root.

| Command | Does |
| --- | --- |
| `npm run dev` | API, web, extension watch, and demo pages together |
| `npm run dev:api`, `dev:web`, `dev:ext` | One of them |
| `npm run check` | Typecheck and test everything. Run before you call work done |
| `npm run typecheck` | All workspaces |
| `npm test` | All workspaces |
| `npm test -w @finvantage/simulator` | One workspace |
| `npm run build` | Build the web app, the API bundle for Vercel, and the extension |

Tests use Node's built-in runner through `tsx`. Test files sit beside the code as `*.test.ts`.

`apps/api/src/app.test.ts` drives the real app through the real typed client, in process. Add to it when you add an endpoint.

## Finding the work

Stubs are tagged with the workstream that owns them:

```bash
grep -rn "STUB(" apps packages --include=*.ts --include=*.tsx
grep -rn "STUB(simulator)" apps packages
grep -rn "TODO(" apps packages
```

Slugs match the files in `docs/workstreams/`. Remove a tag when you replace the stub. Each brief lists scope and acceptance criteria.

## Rules that must not break

These come from the PRD and they are the product's safety story. If a task seems to need breaking one, stop and ask.

1. **Math first.** Every figure a user sees is computed in code before any LLM call. The model only words those figures and may never invent or alter one.
2. **The guardrail stays on.** Card text is checked so that every number appears in the inputs, and it is capped at 60 words. A failure uses the template card.
3. **The demo never shows an empty state.** If the LLM fails, the Copilot shows the deterministic template card.
4. **Suggest only.** Nothing moves money, applies for credit, or clicks anything on a host page.
5. **Extension privacy.** Only `pageType`, `itemType`, `priceCents`, and `merchant` leave the browser. `CopilotContext` is a strict schema, so extra fields are a 400. Do not loosen it. No page text, history, or screenshots.
6. **Secrets stay on the server.** The web app and extension never hold model or bank keys. Anything `NEXT_PUBLIC_` or `EXTENSION_` is public.
7. **Ranges, not numbers.** Show probabilities as ranges with a disclaimer nearby. In the web app use `ProbabilityRange`, which includes it.
8. **Label mocks.** Portfolio and credit score are mocked. The contract forces `mocked: true`, and the UI must show `MockedBadge`.
9. **Confirm before saving parsed input.** Parsing a life event never saves. A misread sentence must not silently change a simulation.
10. **Sandbox only.** Synthetic or Plaid sandbox data. No production bank connections.
11. **One LLM wrapper.** Only `packages/llm/src/client.ts` may touch a provider SDK.
12. **Deterministic simulator.** The same seed and inputs give the same output.

## Conventions

- **Money** is integer cents, in fields ending in `Cents`. Display with `formatUsd`. Never use a float dollar amount.
- **Signs:** account balances are always positive and `isLiability(type)` gives the direction. Transaction amounts are negative for money out.
- **Rates** are decimal fractions: `0.0525` is 5.25%. **Probabilities** run from 0 to 1.
- **Dates** are ISO strings: `2026-11-07`. Timestamps are full ISO datetimes.
- **Schemas** are PascalCase Zod values with a same-named type: `Goal` is both.
- **Imports** between packages use the package name, such as `@finvantage/contracts`. Packages export TypeScript source, so there is no build step between them.
- **Stub or real** is chosen by env in one place, `apps/api/src/deps.ts`. Do not add env checks elsewhere.

## Change contracts first

The API is defined once, in `packages/contracts/src/api.ts`. The server and client are both typed from that table and validate at runtime, so a response that drifts from its contract returns a 500 with code `contract_violation`.

Changing a contract affects other people's work. Keep changes additive when you can, run `npm run check` from the root, and mention the change in your PR. See `docs/RECIPES.md`.

## Before you finish

- `npm run check` passes.
- For UI work, you ran the app and looked at the change. Tests do not cover the web app or the overlay's layout.
- For extension work, you reloaded it in Chrome and opened a demo page.
- You updated the local `AGENTS.md` or `docs/` if behavior or a convention changed.
- You recorded new decisions in `docs/DECISIONS.md`.
- You stated plainly what is still a stub.

## Where to look next

| Task | Start at |
| --- | --- |
| Add or change an endpoint, add a Copilot site, add a life-event type, call a model, replace a stub | `docs/RECIPES.md` |
| Understand a request end to end | `docs/ARCHITECTURE.md` |
| Know why something is the way it is | `docs/DECISIONS.md` |
| Know what a feature must do | `docs/workstreams/<slug>.md`, then `docs/PRD.md` |
