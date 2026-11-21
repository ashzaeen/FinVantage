# Dashboard Enhancements: Design Plan

Covers the components in `docs/workstreams/dashboard-enhancements.md` that need a new design, not the ones that reuse an existing card. Wireframes for each are in `docs/design/dashboard-enhancements-wireframes.html`. Colour rules come from `docs/DECISIONS.md`, "Chart palette and UI pass", and `apps/web/src/lib/chartColors.ts`.

## Design principles for this pass

1. **One answer per card.** Each card has a title that is a question or a noun, one headline figure or picture, and one line saying what it means. No card needs a legend to be understood.
2. **A card must change what someone does.** If a card cannot name a next step, it is a candidate to cut. The audit already cut four.
3. **Money out is orange, money in is teal, never red for spending.** Gain and loss are text with an arrow. Magnitude charts use `--series-1` alone. Warning is amber with a word, not only a colour.
4. **Ranges, never single odds.** Anything uncertain shows a band and the disclaimer line beside it.
5. **Show the sum, then the parts.** A headline number always has its parts one tap away. This is also how rule 1 shows up in the interface.
6. **Suggest, then confirm.** Any card that proposes a change shows the before and after, then a plain button. Nothing saves on slider release.
7. **No empty cards.** Every new card has a worked example state (see "States" below).

## Card budget per tab

After phases 0 to 2, no tab should exceed these. If a new card would go over, an existing one has to move or merge.

| Tab | Max cards above the fold | Max in total | Order, top to bottom |
| --- | --- | --- | --- |
| Overview | 4 | 9 | Needs Attention, Net Worth with drivers, Safe to Spend, Cash Flow, Money Calendar, Credit Cards, Investments, Recent Transactions |
| Advisor | 2 | 3 | Conversation, starter prompts, visuals inline |
| Copilot | 2 | 4 | Install, Try It Now, Impact Summary, Activity |
| Life Events | 2 | 5 | Event form, result, compare, timeline |
| Subscriptions | 3 | 8 | Tiles, Needs a Look, renewal strip, lists, savings waterfall |
| Reports | 2 | 6 | Health Score, latest quarter, deltas, wins |
| Accounts | 3 | 6 | Net worth with type stack, liquidity, payoff race, lists |
| Transactions | 2 | 4 | Filter summary, list, leaderboard and heat calendar behind a toggle |
| Goals | 3 | 5 | Monthly needed, board, milestone ladder, rebalance suggestion |
| Income | 4 | 8 | Expected, payday, sources, band, debt-to-income |
| Spending | 4 | 8 | Split, pace line, categories, budgets, trends |
| Investments | 4 | 8 | Totals, performance, drift, concentration, holdings |
| Credit | 3 | 6 | Score, what-if, payoff order, cards with due dates |
| Settings | 3 | 6 | Alerts, privacy, data, categories |

## Shared patterns

### Card anatomy

```
[icon]  Title in Title Case                      [action or badge]
        One sentence saying what this tells you
-----------------------------------------------------------------
[ headline figure ]   [ delta with arrow ]
[ picture ]
[ one line of meaning ]                          [ MockedBadge? ]
```

Uses `Card` with its default lift. Headline figures count up with `CountUp`. Pictures fill with `bar-grow` or `meter-fill`. Everything respects reduced motion.

### Signals and severity

| Level | Mark | Word | Colour token |
| --- | --- | --- | --- |
| Needs action | Filled circle with "!" | "Over", "Due", "Ends" | `--warning` with `--warning-text` on `--warning-bg` |
| Heads up | Outlined circle | "Rising", "Soon" | `--series-5` |
| Good | Check | "On track", "Saved" | `--gain` |
| Information | Dot | none | `--ink-muted` |

Colour is never the only signal: each has a mark and a word.

### States every new card must have

| State | What it shows |
| --- | --- |
| Loading | A skeleton the same shape as the card, no spinner on top of a card |
| Empty with an example | A sample result, labelled "Example", with one button to use real data. Never a blank |
| Error | One sentence and a Retry button. The rest of the page still renders (the pattern the Subscriptions strip on Overview already uses) |
| Mocked | `MockedBadge` beside any mocked value, and the disclaimer under any range |

### Responsive rules for the new charts

| Width | Rule |
| --- | --- |
| 320 to 639 | One column. Charts keep their height, not their width, and use the compact value labels. Dots and bars 44px tall to touch, or the whole card is the tap target |
| 640 to 1023 | Two columns where the card is a tile. Wide charts (calendar, pace line, timeline) stay full width |
| 1024 and up | Sidebar shows. Cards lay out by their own width with a container query, as `CategoryPie` does |

Every `grid` gets a base `grid-cols-1`. Fields are 16px on touch. Nothing relies on hover. A tooltip's content is also available as the chart's table view.

### Chart table view

Each chart has a "View as Table" toggle that swaps the picture for a table with the same figures. The toggle is a text button at the card's bottom right, 44px tall on touch. Screen readers get the table by default and the chart as decoration.

### Copy rules

Titles are Title Case. Body is sentences. Figures use `formatUsd` and `formatPercent`. A suggestion starts with "Consider" and names the figure. Never "You should". Disclaimers use the existing line: "Educational estimate, not a guarantee."

## Components that need a new design

Each has a wireframe with the same number in `dashboard-enhancements-wireframes.html`.

### W1. Needs Attention Today (OV1)

- **Purpose:** the first thing on Overview. Three to five ranked items from across the app.
- **Anatomy:** a card with a header "Needs Attention Today" and a count. Each row: severity mark, one sentence with the figure, a link to the tab that fixes it, and a Dismiss for today.
- **Ranking:** due within 3 days, over budget, promo ending, price rise, then everything else. Math-core ranks. The page does not.
- **Empty with an example:** "Nothing needs you today" with the next dated item ("Next: Peak Fitness, Dec 4").
- **Mobile:** rows are full-width tap targets. Dismiss is a swipe-free button.

### W2. Safe to Spend (OV2)

- **Purpose:** one number for what is left to spend this month without missing a bill or a savings target.
- **Anatomy:** large figure, a stacked bar of the parts (income expected, bills still due, budget room used, savings target), and a line like "Resets on payday, Dec 1".
- **Maths shown:** each part is a row beneath the bar with its figure, so the sum is checkable (principle 5).
- **States:** if the result is negative, the figure shows "Over by $X" in `--warning-text`, with the cause beneath. Not red.

### W3. What Moved Net Worth (OV3)

- **Purpose:** explain a month's change in net worth.
- **Anatomy:** a waterfall: last month total, contributions, market change, debt paid down, new spending, this month total. Money in teal, money out orange, totals indigo.
- **Interaction:** tap a bar to see the figure and the accounts behind it. Table view available.

### W4. Money Calendar (OV4)

- **Purpose:** the next 30 days of paydays, bills and card due dates, with a projected balance.
- **Anatomy:** a 7-column month grid. Each day has up to 3 dots (income teal, bill orange, card due amber outline). Below it, a projected balance line across the same days, with the lowest day marked.
- **Interaction:** tap a day for the list. Arrow keys move between days. A "Lowest balance: Dec 12, $412" line sits under the chart.
- **Mobile:** a vertical list by week replaces the grid below 640px, keeping dots and the balance line.

### W5. Bullet Bar family (OV5, AC2, GO1, IV1, CR3)

One component, five uses. A track, a filled bar, an optional target tick, an optional drift band.

- **Cash runway:** fill is months covered. Ticks at 3 and 6 months.
- **Liquidity ladder:** three bars (today, within 30 days, locked) in one stack.
- **Monthly needed:** fill is contribution, tick is the need. Under the tick shows "Short by $32 a month".
- **Allocation drift:** fill is actual, tick is target, shaded band is the allowed drift. Past the band, a one-line suggestion.
- **Promo countdown:** fill is days left, tick is the payment needed to clear in time.

### W6. Debt Payoff Race (AC3, CR2)

- **Purpose:** compare payoff orders for the user's own debts.
- **Anatomy:** two lines (avalanche in `--series-1`, snowball in `--series-3`) over time, a final dot on each with its payoff date, and a summary row: "Avalanche saves $214 in interest and finishes 3 months sooner."
- **Controls:** a segmented control for strategy and a field for extra monthly payment, with 16px type on touch.
- **Rule 4:** copy is "Consider paying the Cash Rewards Card first". Nothing is paid.

### W7. Utilization What-If (CR1)

- **Purpose:** show what a payment does to utilization and the estimated score.
- **Anatomy:** a slider from $0 to the card's balance, a before and after utilization pair, and an **estimated score range**, always with `MockedBadge`.
- **Interaction:** the figures update when the slider is released. The old figure stays visible beside the new one.
- **Disclaimer:** "Demo estimate. Real scores vary by bureau and model." under the range.

### W8. Health Score (RP3)

- **Purpose:** one composite with its four parts.
- **Anatomy:** a half-ring with the total, four small bars underneath (savings rate, debt-to-income, utilization, runway), each with its figure and a one-word status.
- **Trend:** a sparkline of the last four quarters. Each part links to its tab.
- **Honesty:** the formula is one tap away ("How This Is Worked Out").

### W9. Life Events: Compare, Timeline, Stress (LE2, LE4, LE5)

- **Compare:** two columns, each with an event name, its monthly cost, and goal dates. A difference row in the middle says "Buy a Home pushes the Japan trip 4 months, New Baby pushes it 2".
- **Timeline:** lanes across five years, one per saved event, with goal funding dates as markers. A scrub bar sets the "as of" date.
- **Stress test:** two toggle chips under the result: "Income down 20%" and "Rent up 10%". The bands redraw and the old bands remain as a dashed outline.

### W10. Spending Pace Line (SP1)

- **Purpose:** show ahead or behind on any day of the month.
- **Anatomy:** cumulative spend this month in `--series-1`, last month as a dashed grey line, the budget as a flat tick at the end. A label "Day 21: $410 under last month's pace".
- **Mobile:** the same chart at 220px tall with only the first and last month labels.

### W11. Spending Small Multiples and Heat Calendar (SP2, SP5, TX4)

- **Small multiples:** every category row gains a 6-month sparkline, 64px wide, no axis. Rising categories are marked with an up arrow, in text.
- **Heat calendar:** a grid of the month's days, intensity from `--series-1`. No-spend days are outlined and counted ("4-day streak").
- **Both:** the table view lists the same figures by month or day.

### W12. Tap a Number to See Its Math (AD5)

- **Purpose:** make the "math first" rule visible in the chat.
- **Anatomy:** every figure in an answer is a dotted-underline button. A bottom sheet on phones, a side drawer on desktop, opens with: the figure, what it is, its inputs with data date, and the formula's name.
- **Focus:** the drawer traps focus, returns it to the figure, closes on Escape. Same pattern as the phone nav drawer.

### W13. Settings: Alerts, Privacy Center, Data (ST1, ST2, ST3)

- **Alerts:** a list of signals, each with a toggle and a plain sentence ("Tell me when a bill goes up"). In-app only for now (D3).
- **Privacy Center:** four fields the extension sends (page type, item type, price, merchant), each with an example value, and a line "Nothing else leaves your browser". This is the strongest trust card in the product.
- **Data:** "Download My Data" (CSV and JSON) and "Delete My Data", where delete needs a typed confirmation.

### W14. Copilot Impact and Try It (CP1, CP2)

- **Try It Now:** a card with a sample product, price and a button. The result drops into the feed as a real event labelled "Example".
- **Impact Summary:** three tiles: checked, flagged, and days goals would have slipped. A line chart by week below.

### W15. Transactions Summary and Unusual Flag (TX1, TX2)

- **Summary bar:** sits above the list. In, out, net, and a 6-month bar strip for the current filter. It changes as the filter changes.
- **Unusual flag:** a small chip on a row, "2.4x usual for this merchant", with the usual amount on tap. Orange outline, not red.

### W16. Goals: Rebalance Suggestion (GO4)

- **Purpose:** propose a way to move money between goals so more of them land on time.
- **Anatomy:** a before and after pair of bullet bars for each affected goal, a one-line summary, and two buttons: "Apply This Plan" and "Not Now". Apply previews first and saves only on Confirm (rule 9).

## Things that reuse an existing design (no new design needed)

Price history sparkline (uses `Sparkline`), category donut (`CategoryPie`), Share as PDF (existing life-simulator export), milestone ladder (`GoalCard` progress), merchant concentration (`CategoryPie`), tax-advantaged mix (a stacked variant of Allocation), appearance and bank health rows (list rows in Settings and Accounts).

## Design checks before each phase ships

- Look at every changed tab at 320, 390, 768 and 1440px, in light and dark.
- Colour-blind check: delete the colour and confirm each signal still has a mark and a word.
- Keyboard: every chart's table view, drawer and slider reachable and operable.
- Reduced motion: no card relies on an animation to be understood.
- Title Case on every label, sentences in body copy.
- The card budget above still holds.
