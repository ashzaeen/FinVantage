# Advisory and report agents

**Tier:** P1 Advisory Agent, P2 Quarterly Report. **Code:** `packages/llm/src/advisory.ts`, `packages/llm/src/quarterly.ts`, `apps/api/src/routes/agents.ts`, `apps/web/src/app/advisor`. **PRD:** section 7.

## Scope

**Advisory Agent:** takes a Copilot event, a simulator change, or a question, and returns 2 to 3 ranked options with explicit trade-offs.

**Quarterly Report Agent:** writes a quarter-over-quarter recap from stored runs, Copilot events, and recommendations.

## You have now

The Advisor page now provides a multi-turn chat backed by the configured Gemini provider and a small server-side retrieval step over the user's accounts, goals, recent transactions, life events, and latest simulation. When Gemini is unavailable, it returns a clear safe fallback. The ranked Advisory Agent still returns placeholder options. Quarterly reports now aggregate two stored
quarters, use Gemini only for wording, validate every number, persist in MongoDB, generate a local
PDF, and support email delivery with a mock default, Gmail SMTP, or the legacy Resend adapter. The PDF uses the dashboard palette
and renders deterministic KPI cards, an asset-allocation pie, quarter-over-quarter range bars, a
spending trend, simulator goal pathways with uncertainty bands, categorized planning suggestions,
and non-guarantee labels. When no prior-quarter run exists, it produces a single-quarter baseline
instead of blocking report generation.
The Reports page also persists an automatic delivery frequency and recipient, shows delivery
attempts, and visualizes the API's real monthly transaction aggregates with responsive charts.
An external cron calls the API worker; MongoDB leases due schedules to prevent duplicate claims.

## Start here

1. Wait for `GeminiClient` or build against a fake `LlmClient`.
2. Use Gemini function calling, with the math core and simulator as tools.
3. Quantify options by running the simulator with `whatIf` values, so each one has a real probability change.
4. Tailor by flexibility: non-negotiable goals get spending cuts, flexible goals get timeline changes.

## Done means

- For a goal whose probability dropped, the agent returns at least two options, each with a quantified effect.
- Each option lists its numbers and links to its simulation run.
- It never gives one bossy answer, and never acts for the user.
- P2: a report cites a number from each of two consecutive quarters and names the cause of the largest change.

## Depends on

`GeminiClient` from copilot-backend, and the real simulator for meaningful numbers. Figures come from code, as with Copilot cards, so apply the same guardrail.
