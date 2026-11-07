# packages/contracts

The shared language of the repo: Zod schemas, types, the route table, and the typed client. Read the root `AGENTS.md` first.

Everything depends on this package, so a change here affects everyone.

| File | Holds |
| --- | --- |
| `src/common.ts` | `Cents`, `Rate`, `Probability`, dates, `formatUsd`, `formatPercent` |
| `src/user.ts`, `account.ts`, `goal.ts`, `life-event.ts` | Core entities |
| `src/simulation.ts` | Snapshot, what-if, runs, fan chart, diffs |
| `src/copilot.ts` | Context, metrics, card, events |
| `src/advisory.ts` | Situations, recommendations, quarterly reports |
| `src/spending.ts` | Budgets, recurring charges, mocked portfolio and credit |
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
