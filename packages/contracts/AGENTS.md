# packages/contracts

The shared language of the repo: Zod schemas, types, the route table, and the typed client. Read the root `AGENTS.md` first.

Everything depends on this package, so a change here affects everyone.

| File | Holds |
| --- | --- |
| `src/common.ts` | `Cents`, `Rate`, `Probability`, dates, `formatUsd`, `formatPercent` |
| `src/user.ts`, `account.ts`, `goal.ts`, `life-event.ts` | Core entities |
| `src/simulation.ts` | Snapshot, what-if, runs, fan chart, diffs |
| `src/copilot.ts` | Context, metrics, card, events |
| `src/advisory.ts` | Situations, recommendations, quarterly reports (`ReportVisuals` includes the nullable `subscriptions` figures) |
| `src/spending.ts` | Budgets, recurring charges, mocked portfolio and credit |
| `src/insights.ts` | The Overview's runway and savings rate, the credit cards overview, and goal milestones |
| `src/planning.ts` | Safe to spend, attention, health score, goal funding, spending pace, budget suggestions, unusual charges, credit what-if, debt payoff, allocation drift, Copilot impact |
| `src/transaction-insights.ts` | Transaction totals for a set of ids, and a month's spending patterns |
| `src/account.ts` (transactions) | `Transaction.manual` and `hidden` are derived flags: set when listing, never stored or accepted in a body |
| `src/changes.ts` | `ChangeRequest` and `ChangeDraft`: a change the Advisor proposes (add, edit or remove a transaction, a budget, a goal, a rule, a split, an account's terms, a subscription's status, and the tap-only ones), with a read-back and what undo needs. The Advisor never makes it |
| `src/navigation.ts` | `APP_PAGES`, the only pages the Advisor may open, with `isAppHref` (a link is one of them, or a Transactions search), `pageHref` and the words said when one opens |
| `src/period.ts` | Totals for any date range (`PeriodQuery`, `PeriodSummary`): spent, income or saved, by the monthly summary's rules |
| `src/speech.ts` | Spoken replies: `SpeakRequest`/`SpeakResponse`, `speechChunks`, and `speakable` (amounts and dates written for the voice) |
| `src/subscription.ts` | Subscriptions and bills, their flags, status and totals, the cancellation guide, and the drafted messages |
| `src/live.ts` | Pushed messages |
| `src/api.ts` | **The route table** |
| `src/client.ts` | `createApiClient` |

## Rules

- No logic beyond formatting and small lookups. No Node-only or browser-only APIs, because this runs in the server, the browser, and the extension.
- Prefer additive changes: new optional or nullable fields over renames.
- Keep `CopilotContext` strict and minimal. It is the privacy boundary.
- Keep `mocked: z.literal(true)` on mocked data.
- Keep `Recommendation.options` at two to three, and `QuarterlyReport.nextSteps` at one to two. Both come from the PRD.
- After any change, run `npm run check` at the root. TypeScript will show every consumer you affected.
