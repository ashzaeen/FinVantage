# Landing Page Plan: One Row per Headline Feature

Status: planned, not built. The hero's purchase tryout (idea 1) is built. These rows come later.

## Goal

Give each headline feature its own row below the hero, so a visitor sees every one in action before signing in. Each row pairs a short title and one sentence with a small interactive or animated visual.

The feature tiles row ("What FinVantage Does") stays as the overview. These rows sit below it, in this order.

## Rules for every row

- **One moving moment per row.** It starts when the row scrolls into view and plays once. Nothing loops forever.
- **Alternate sides.** Text on the left and the visual on the right, then swap for the next row. On phones, stack text above the visual.
- **Title Case** for titles, buttons, tabs and badges. Sentences for body copy (see `apps/web/AGENTS.md`).
- **Label scripted numbers.** Any row not backed by the API says "Example" near its numbers. Never present invented figures as the visitor's own.
- **Keep it short.** A title, one sentence, and the visual. No bullet lists.
- **Reuse the system:** `--radius-card`, `--shadow-float` and the purple tokens in `globals.css`.

## Rows

### Row 1: Copilot in Action (scripted)

- **Shows:** a small browser window with a rental listing. After a second, the Copilot card slides in from the bottom-right with Impact, Trade-off and Smart Move.
- **Interaction:** three tabs (Rent, Checkout, Car Quote) swap the page and the card.
- **Data:** example copy, labelled "Example Card". Match the real overlay's styles in `apps/extension/src/content/overlay.ts`.
- **Builds on:** the browser mock removed from an earlier version of the landing page, in git history under `components/landing/Sections.tsx`.
- **Done when:** each tab shows its own page and card, and the card animates in once per tab change.

### Row 2: Talk to Your Finances (scripted for now)

- **Shows:** a question types itself out: "What should I cut to get my house down payment back on track?". Then two or three ranked answer cards fade in, each with a trade-off and a figure ("Cut dining by $150 a month", "Push the goal back 8 months").
- **Interaction:** two or three suggested questions as chips. Tapping one replays it.
- **Data:** scripted until the Advisor Agent uses Gemini (`docs/workstreams/advisory.md`). Then it can call `POST /v1/advisory` with a `user_question` on the demo profile.
- **Done when:** the answers never read as one bossy answer. Always show at least two options.

### Row 3: Plan for Life Events (scripted for now)

- **Shows:** an input whose placeholder cycles through "We're having a baby in March", "Moving to Austin in June" and "Starting a new job". Pressing Enter shows the confirmation card (Event, When, Cost) with Save and Cancel, then a line on what it does to a goal.
- **Interaction:** visitors can type their own sentence. Until the parser is live, any input maps to the closest scripted example.
- **Data:** scripted until the free-text parser uses Gemini (`docs/workstreams/life-events.md`). Then call `POST /v1/life-events/parse`. It never saves from the landing page.
- **Done when:** the confirmation card appears before anything about the goal changes, as the PRD requires.

### Row 4: Everything in One Place (animation)

- **Shows:** six small account cards (Checking, Savings, CD, IRA, Auto Loan, Mortgage) slide into a stack and total up to a net worth figure.
- **Interaction:** none beyond the entrance. Hovering a card lifts it 2px.
- **Data:** can use the live demo profile through `GET /v1/accounts` and `GET /v1/net-worth`, with a static fallback if the API is down.
- **Done when:** all seven stored account types appear (CD and IRA are separate cards), and the total matches the API.

### Row 5: Monthly Reports (static preview)

- **Shows:** a short report card: "What Went Well", "What Didn't", and "Next Steps", with one small chart.
- **Interaction:** a toggle between two months, to show the comparison.
- **Data:** example copy until the report agent's output is stable (`docs/workstreams/advisory.md`, Quarterly Report). **Open question:** the tile says monthly, but the PRD and the current build are quarterly. Settle this before building.

## Build order

1. Copilot in Action, the most distinctive feature and fully scripted.
2. Everything in One Place, which can be live.
3. Talk to Your Finances.
4. Plan for Life Events.
5. Monthly Reports, after the monthly or quarterly question is settled.

Rows 2, 3 and 5 can switch from scripted to live once Gemini is connected, without changing their layout.

## Files

- `apps/web/src/components/landing/rows/<RowName>.tsx`, one client component per row.
- `apps/web/src/app/(marketing)/page.tsx` mounts them below `<Features />`.
- Photos follow `components/landing/photos.ts`: CC0 only, with the source link recorded.
