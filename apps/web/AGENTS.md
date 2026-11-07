# apps/web: dashboard

Next.js App Router and Tailwind v4. Read the root `AGENTS.md` first. Brief: `docs/workstreams/web-dashboard.md`.

## Layout

| Path | Holds |
| --- | --- |
| `src/app/<route>/page.tsx` | One folder per nav item. Server components that fetch data |
| `src/app/<route>/*Client.tsx` | Interactive parts, with `"use client"` |
| `src/components/layout` | `AppShell`: responsive navigation |
| `src/components/ui` | Generic pieces: `Card`, `Stat`, `PageHeader`, `MockedBadge` |
| `src/components/finance` | Domain pieces: `ProbabilityRange`, `GoalCard`, `FanChart` |
| `src/lib/api.ts` | The typed API client |
| `src/lib/useLiveEvents.ts` | Subscribes to pushed updates |
| `src/lib/nav.ts` | Navigation items |
| `src/app/globals.css` | Design tokens for light and dark |

## Rules

- Get data through `api` from `@/lib/api`. It works in server and client components and validates every response. Do not call `fetch` directly.
- Import only from `@finvantage/contracts`, never from other packages.
- Do not compute financial figures here. If the API does not return a number you need, add it to the API. Every number must link back to its inputs.
- Show probabilities only through `ProbabilityRange`, as a range with its disclaimer.
- Put `MockedBadge` beside any mocked value.
- Use token classes such as `bg-raised` and `text-muted`, not raw colors. Add new tokens to both the light and dark blocks in `globals.css`.
- Layouts must work down to phone width.
- Pages stay dynamic because the API client uses `no-store`. They need the API running. `src/app/error.tsx` handles it being down.

## Working on it

```bash
npm run dev:api   # in one terminal
npm run dev:web   # in another
```

Styling is deliberately a placeholder. `FanChart` is a basic SVG that the design-track version replaces: keep its props, and add a table view for accessibility. Remove `tier` and `prd` from `PageHeader` before the demo.

Tests do not cover this app. Run it and look at the page at desktop and phone widths.
