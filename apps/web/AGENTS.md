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
| `src/components/landing` | Landing page pieces: `Hero` + `HeroSimulation`, `UseCases` + `previews.tsx` (the animated mini-UIs), `HowItWorks`, `CopilotSection` (tabbed deep dive), `ProofStrip`, `TrustSection`, `ClosingCta`, `Header`, `Footer`. `motion.tsx` holds `Reveal`, `useInView`, `useStages`, `useCountTo`; `layout-parts.tsx` holds `Section`, `SectionHeading`, `ExampleTag`. Style with the `lp-*` Tailwind utilities, never inline colors. Every scripted figure carries an Example tag. Plan: `docs/landing-page-plan.md` |
| `src/app/login/LoginForm.tsx` | Email and password sign-in. The landing hero embeds it with `embedded` |
| `src/components/layout` | `AppShell`: the sidebar from 1024px, and below that a top bar with a menu button and a slide-in drawer. Both render one `SidebarContent` |
| `src/components/ui` | Generic pieces: `Card`, `Stat`, `PageHeader` (with a `subtitle`), `Button` (`buttonClass()` for a Link or label), `MockedBadge` |
| `src/components/spending` | `CategoryIcon`: one Lucide icon per spending category, inherited by custom ones. Use it wherever a category is shown |
| `src/components/finance` | Domain pieces: `ProbabilityRange`, `GoalCard`, `FanChart` |
| `src/app/(app)/advisor/visuals` | The Advisor's interactive visuals and their shared pieces (`shared.tsx`: chips, sliders, the fan chart, the recompute hook). They never compute figures; they ask `POST /v1/advisory/visuals` |
| `src/components/charts` | Shared chart pieces: `BulletBar` (a bar with an optional target tick and band), `Sparkline`, `HeatGrid` (a month by day), `DotCalendar` (days with dots for events; from 640px each day opens its list and takes arrow keys, below that it is a list by date) and `StackedBar` (one bar split into parts, with a legend). They draw what they are given, use tokens, and carry a hidden text version. Read them before drawing a new chart |
| `src/lib/allocationPresets.ts` | Names for the five asset classes and the preset target mixes on Investments |
| `src/lib/dataExport.ts` | CSV builders for the Download My Data card on Settings. `csvCell` makes a cell that could run as a formula into text |
| `src/lib/visualCompare.ts`, `src/lib/figureLinks.ts` | Which figures to set side by side for two Advisor scenarios, and which figures in an answer have a working behind them (tappable). Both pure and tested; they compute nothing |
| `src/app/(app)/transactions` | The Transactions page. A row's edit window ends with Delete Transaction (rows marked Manual, removed for good) or Hide Transaction (bank rows, kept but left out of totals), each with an inline confirm. A Hidden tab lists hidden rows with Restore. The page calls `router.refresh()` after either, because the cards beside the list are server-rendered |
| `src/lib/format.ts` | `shortDate`, `monthName`, `monthYear`, `compactUsd`, `plural` and day counting. Pure, tested |
| `src/lib/api.ts` | The typed API client |
| `src/lib/session-fetch.ts` | The fetch behind `api`: sends the visitor's token, and in the browser swaps a refused session for a new guest session (see `docs/DECISIONS.md`, refused sessions). Tested in `session-fetch.test.ts` |
| `src/lib/useLiveEvents.ts` | Subscribes to pushed updates: SpacetimeDB when signed in, SSE otherwise |
| `src/spacetime/` | Generated SpacetimeDB client bindings. Do not edit: run `npm run generate -w @finvantage/spacetime` |
| `src/lib/nav.ts` | Navigation items. Finances run Accounts, Transactions, Income, Spending, Goals, Credit, Investments |
| `src/lib/dictation.ts`, `src/lib/useSpeechRecognition.ts` | Voice dictation for the Advisor's message box. The hook wraps the browser's Web Speech API (hidden when unsupported). `cleanTranscript` fixes wording only ("28 grand" to $28,000, "four oh one k" to 401(k)) and never computes a figure. Dictation fills the box and never sends. Tested in `dictation.test.ts`. `src/lib/useSpokenReplies.ts` reads a saved Advisor reply aloud through `POST /v1/advisory/speak`, one chunk at a time, and falls back to the browser's voice. The voice call: `src/lib/voice-call.ts` is the pure turn-taking state machine (half-duplex: the mic is only live while listening; 1.5 s of silence ends a turn; a 5 minute cap with a 30 s warning and a goodbye), tested in `voice-call.test.ts`; `src/lib/useVoiceCall.ts` runs it (recognition, send, speak, clock); `src/lib/useMicLevel.ts` writes the mic loudness to `--level` for the orb; `src/app/(app)/advisor/VoiceCall.tsx` is the full-screen sheet and `src/components/voice/AdvisorOrb.tsx` the orb (styles at the end of `globals.css`, tokens only). `AdvisorClient` opens it from a Call button in the input row and a hero button on the empty state. Changes the Advisor proposes: `src/lib/changes.ts` saves a confirmed `change_draft` through the ordinary routes and returns its undo; `src/app/(app)/advisor/change-store.ts` (and `change-drafts.ts`, the browser instance) holds where each draft stands, so a tap and a spoken yes share one state and a change is never saved twice; `ChangeDraftCard.tsx` is the card (and `GoalDraftCard` uses the same store); `src/lib/voice-intents.ts` recognises a whole-utterance yes, no or undo. In `AdvisorClient`, `answerByVoice` handles those during a call without sending them to the Advisor, and refuses a spoken yes for anything that needs a tap. `DataCard.tsx` shows the figures behind an answer. The call runs in the layout: `src/app/(app)/advisor/AdvisorCallProvider.tsx` (mounted in `(app)/layout.tsx`) owns the call, its chat id and its voice, so opening another page does not end it, and `VoiceCall.tsx` is the sheet and, minimized, the pill. `AdvisorClient` only starts it (`useAdvisorCall().start`) and reloads its chat on each saved turn. `src/lib/voice-navigation.ts` matches clear spoken commands ("open Goals", "show my Starbucks transactions") with no Advisor; the page list is `APP_PAGES` in contracts, and a test keeps it equal to `nav.ts`. A link is followed only if `isAppHref` allows it. Plan for the call and voice actions: `docs/workstreams/voice.md` |
| `src/lib/subscriptions.ts` | Words and ordering for the Subscriptions page: cadence and flag labels, one sentence per flag from the API's figures, sorting, and the 30-day upcoming window. Tested in `subscriptions.test.ts`. It computes no financial figures |
| `src/app/(app)/subscriptions` | The Subscriptions page (Intelligence): headline tiles, Needs a Look, the subscription and bill lists with a filter and sort, Upcoming Charges and a Cancelled card. Each row has a Manage panel (`SubscriptionActions.tsx`): keep, cancelling, cancelled, the cancellation guide, drafted messages to copy, and, for a cancelled one, Put This Toward a Goal, which previews and then saves a recurring life event only on Confirm. Plan: `docs/workstreams/subscriptions.md` |
| `src/lib/chartColors.ts` | The one categorical chart palette (`seriesColor`, `ASSET_CLASS_COLOR`). Read it instead of writing colors into a chart |
| `src/lib/theme.ts`, `src/components/theme` | Theme state, the flag, the pre-paint script, `ThemeProvider`, and the Appearance card on Settings |
| `src/app/globals.css` | Design tokens. Chart colors, money in and out, gain and loss are explained in the comments there |

## Rules

- Get data through `api` from `@/lib/api`. It works in server and client components and validates every response. Do not call `fetch` directly.
- Import only from `@finvantage/contracts`, never from other packages. The one exception is the `spacetimedb` SDK and its generated bindings (`@/spacetime`), used only in `useLiveEvents`.
- Do not compute financial figures here. If the API does not return a number you need, add it to the API. Every number must link back to its inputs.
- **Spent and saved are two figures.** "Spent" is `SpendingSummary.spentCents`: money out, minus transfers and money moved to savings or investing. "Saved" is `savedCents`. Never add category rows to make a total, and keep rows whose category `bucket` is `savings` out of any chart that says "spent". Decision: `docs/DECISIONS.md`, "Dashboard enhancements, phase 0".
- Use the API's date, never `new Date()`, for anything that depends on today: the demo's clock is not the visitor's (`asOf` on a response says which day the figures are for).
- If a new Tailwind class (an arbitrary value such as `lg:grid-cols-[17rem_1fr]`) has no effect in `next dev`, touch `src/app/globals.css` to rebuild the stylesheet.
- Show probabilities only through `ProbabilityRange`, as a range with its disclaimer.
- Put `MockedBadge` beside any mocked value.
- **Chart colors:** one meaning per color, on every page. Money in is `--flow-in` (green) and money out is `--flow-out` (red); they are the same green and red as `--good` and `--critical` (a test keeps them equal), so income against spending reads the same on Overview, Income, Reports and everywhere else. A chart of one measure alone (a single magnitude) uses `--series-1`. Categories use `seriesColor(i)`. Gain and loss are `--gain` and `--loss` text with an arrow. Decision and validation: `docs/DECISIONS.md`, "Chart palette and UI pass" and "Income and spending bars".
- Use token classes such as `bg-raised` and `text-muted`, not raw colors. Add new tokens to both the light and dark blocks in `globals.css`; `src/lib/theme-tokens.test.ts` fails if one is missing. Text and links in the accent use `text-accent-ink`, not `text-accent` (`--accent` is the fill under white text). A new hardcoded color raises the count in `npm run theme:audit -w @finvantage/web`, which fails; put `theme-ok` on a line that must stay the same in both themes, or `theme-ok-file` once for a file of fixed colors such as card artwork. The audit runs inside `npm test`.
- **Dark mode** is on for everyone. `DARK_MODE_ENABLED` in `src/lib/theme.ts` is its kill switch: set `NEXT_PUBLIC_DARK_MODE=0` and every visitor gets light. `ThemeProvider` is in the root layout, `themeScript()` sets `data-theme` before paint, and the choice lives in `localStorage` as `fv-theme`. `UNTHEMED_PATHS` (empty now) holds any page still being converted, so it stays light. Landing tokens have dark values too: use `bg-lp-surface` for a card and `text-lp-ink` for indigo text. `ThemeCycleButton` is the one-button toggle for tight headers. Decisions and phases: `docs/DECISIONS.md`, "Dark mode". Check a page in both themes at 390, 768 and 1280px.
- Layouts must work down to phone width. Check 320, 390 and 768px.
  - Give every `grid` a base `grid-cols-1` before its `sm:` and `md:` columns. A bare `grid` sizes its column to its widest child and makes the page scroll sideways.
  - A row with a title and a button must wrap (`Card` and `PageHeader` do). Put `min-w-0` on a flex or grid child that holds long text.
  - Lay a component out by its own width with a container query (`@container`, `@sm:`) when the same component sits in cards of different widths, as `CategoryPie` does.
  - The sidebar shows from 1024px (`lg:`). Use `max-lg:` for phone and tablet rules, not `md:`.
  - Touch screens get 16px fields and 44px buttons from `globals.css` (see the phones and tablets rules at its end). Give an icon button an explicit `max-lg:h-11 max-lg:w-11`, and a text link `min-h-11`. Never paint a dot or a swatch on a `button` itself: put it in an inner element, or the 44px rule will stretch it.
  - Pin full-height layouts with `dvh`, not `vh`, and pad fixed bars with `env(safe-area-inset-*)`.
  - Never rely on hover for anything. Reveal-on-hover must also show on touch.
- **One of each.** Buttons come from `components/ui/Button` (`primary`, `secondary`, `quiet`; sizes `sm`, `md`, `lg`), not a one-off recipe. Icons are Lucide only: no Font Awesome, no hand-drawn nav SVGs, no `▲ ▼ ✓ ×` glyphs standing in for icons. Text is 12px or larger (`text-xs` is the floor; do not write `text-[9px]`, `[10px]` or `[11px]`), and a `text-muted` label must stay at 4.5:1 or better (`--ink-light` is for icons and lines, never text). Show dates with `longDate`, `shortDate` or `monthYear` and money on axes with `compactUsd`, all from `src/lib/format.ts`; never print an ISO date or a bare `$1.3K`/`$42.8` mix. One heading level per idea: the page title is the `h1`, so do not repeat it in an `h2`. Put a one-line intro in `PageHeader`'s `subtitle`.
- **Keyboard and touch.** Dashboard pages start with a skip link to `#main-content`. If you hide the browser outline with `outline-none`, give a replacement: `focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink` (the solid class is needed in Tailwind 4). Every control is 44px tall below 1024px; use `buttonClass` for a link that looks like a button, and give a standalone link `max-lg:min-h-11`.
- Pages show `app/(app)/loading.tsx` (a skeleton) while the API answers, and `app/not-found.tsx` for an unknown address.
- **Interaction and motion, the same on every tab:**
  - Cards lift on hover like the Accounts tiles. `Card` does it by default; pass `lift={false}` for forms and controls. Anything else that reads as a card gets the `card-lift` class.
  - Small tiles and rows inside a card (stat tiles, list rows, holdings) get `tile-lift`, a lighter version.
  - Pages open with motion: wrap the page's grid in `page-cascade` (or a lone panel in `page-cascade-single`), give list rows `row-cascade` with `--i` set to their index, count headline figures up with `CountUp` from `@/components/ui/CountUp`, and fill bars and meters with `meter-fill` or `bar-grow`. Recharts charts animate by default; leave `isAnimationActive` on.
  - Everything respects `prefers-reduced-motion`. The classes live at the end of `src/app/globals.css`.
- **Title Case for interface labels.** Headings, page titles, buttons, links, tabs, nav items, badges, form labels and card titles use Title Case: "Try the Demo", "Create Your Account", "Life Events". Keep a, an, the, and, but, or, nor, for, so, yet, as, at, by, in, of, on, to and up lowercase unless they come first or last. Body copy, descriptions, helper text and error messages stay as normal sentences. Brand names keep their own casing (FinVantage, GitHub).
- Dashboard pages are dynamic through `export const dynamic` in `(app)/layout.tsx`, because `no-store` alone no longer keeps them dynamic under `next build --webpack`. They need the API running, and `(app)/error.tsx` handles it being down. The landing page stays static and loads its preview in the browser.
- The landing hero embeds `LoginForm`, and "Use a Demo" opens `/app` signed out. `src/proxy.ts` gives each signed-out visitor a private guest session (`POST /auth/guest`) before a dashboard page renders; **a new dashboard route must be added to the route list in its `matcher`**, or visitors who open it directly get the read-only demo token and can't write; the shared demo token is read-only and is only a fallback when no guest session can be had. After sign-in, `nextPath()` goes to `?next=` or else `/app`.
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
