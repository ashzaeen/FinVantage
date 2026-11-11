# apps/web: dashboard

Next.js App Router and Tailwind v4. Read the root `AGENTS.md` first. Brief: `docs/workstreams/web-dashboard.md`.

## Layout

| Path | Holds |
| --- | --- |
| `src/app/(marketing)/page.tsx` | The public landing page at `/`, with sign-in in the hero |
| `src/app/(app)/layout.tsx` | Adds the sidebar to every dashboard page and keeps them dynamic |
| `src/app/(app)/app/page.tsx` | The dashboard overview, at `/app` |
| `src/app/(app)/<route>/page.tsx` | One folder per nav item. Server components that fetch data. Route groups do not change URLs |
| `src/app/(app)/<route>/*Client.tsx` | Interactive parts, with `"use client"` |
| `src/components/landing` | Landing page pieces: header, the live purchase tryout, Airbnb-style feature cards, footer. Photo sources are in `photos.ts`. Planned feature rows are in `docs/landing-page-plan.md` |
| `src/app/login/LoginForm.tsx` | Email and password sign-in. The landing hero embeds it with `embedded` |
| `src/components/layout` | `AppShell`: responsive navigation |
| `src/components/ui` | Generic pieces: `Card`, `Stat`, `PageHeader`, `MockedBadge` |
| `src/components/spending` | `CategoryIcon`: one Lucide icon per spending category, inherited by custom ones. Use it wherever a category is shown |
| `src/components/finance` | Domain pieces: `ProbabilityRange`, `GoalCard`, `FanChart` |
| `src/app/(app)/advisor/visuals` | The Advisor's interactive visuals and their shared pieces (`shared.tsx`: chips, sliders, the fan chart, the recompute hook). They never compute figures; they ask `POST /v1/advisory/visuals` |
| `src/lib/api.ts` | The typed API client |
| `src/lib/session-fetch.ts` | The fetch behind `api`: sends the visitor's token, and in the browser swaps a refused session for a new guest session (see `docs/DECISIONS.md`, refused sessions). Tested in `session-fetch.test.ts` |
| `src/lib/useLiveEvents.ts` | Subscribes to pushed updates: SpacetimeDB when signed in, SSE otherwise |
| `src/spacetime/` | Generated SpacetimeDB client bindings. Do not edit: run `npm run generate -w @finvantage/spacetime` |
| `src/lib/nav.ts` | Navigation items |
| `src/app/globals.css` | Design tokens for light and dark |

## Rules

- Get data through `api` from `@/lib/api`. It works in server and client components and validates every response. Do not call `fetch` directly.
- Import only from `@finvantage/contracts`, never from other packages. The one exception is the `spacetimedb` SDK and its generated bindings (`@/spacetime`), used only in `useLiveEvents`.
- Do not compute financial figures here. If the API does not return a number you need, add it to the API. Every number must link back to its inputs.
- Show probabilities only through `ProbabilityRange`, as a range with its disclaimer.
- Put `MockedBadge` beside any mocked value.
- Use token classes such as `bg-raised` and `text-muted`, not raw colors. Add new tokens to both the light and dark blocks in `globals.css`.
- Layouts must work down to phone width.
- **Interaction and motion, the same on every tab:**
  - Cards lift on hover like the Accounts tiles. `Card` does it by default; pass `lift={false}` for forms and controls. Anything else that reads as a card gets the `card-lift` class.
  - Small tiles and rows inside a card (stat tiles, list rows, holdings) get `tile-lift`, a lighter version.
  - Pages open with motion: wrap the page's grid in `page-cascade` (or a lone panel in `page-cascade-single`), give list rows `row-cascade` with `--i` set to their index, count headline figures up with `CountUp` from `@/components/ui/CountUp`, and fill bars and meters with `meter-fill` or `bar-grow`. Recharts charts animate by default; leave `isAnimationActive` on.
  - Everything respects `prefers-reduced-motion`. The classes live at the end of `src/app/globals.css`.
- **Title Case for interface labels.** Headings, page titles, buttons, links, tabs, nav items, badges, form labels and card titles use Title Case: "Try the Demo", "Create Your Account", "Life Events". Keep a, an, the, and, but, or, nor, for, so, yet, as, at, by, in, of, on, to and up lowercase unless they come first or last. Body copy, descriptions, helper text and error messages stay as normal sentences. Brand names keep their own casing (FinVantage, GitHub).
- Dashboard pages are dynamic through `export const dynamic` in `(app)/layout.tsx`, because `no-store` alone no longer keeps them dynamic under `next build --webpack`. They need the API running, and `(app)/error.tsx` handles it being down. The landing page stays static and loads its preview in the browser.
- The landing hero embeds `LoginForm`, and "Use a Demo" opens `/app` signed out. `src/proxy.ts` gives each signed-out visitor a private guest session (`POST /auth/guest`) before a dashboard page renders; the shared demo token is read-only and is only a fallback when no guest session can be had. After sign-in, `nextPath()` goes to `?next=` or else `/app`.
- Plain modules in `src/lib` can have `*.test.ts` beside them; `npm test -w @finvantage/web` runs them, and `npm run check` includes them.

## Working on it

```bash
npm run dev:api   # in one terminal
npm run dev:web   # in another
```

Styling is deliberately a placeholder. `FanChart` is a basic SVG that the design-track version replaces: keep its props, and add a table view for accessibility. Remove `tier` and `prd` from `PageHeader` before the demo.

Tests do not cover this app. Run it and look at the page at desktop and phone widths.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
