# Advisory and report agents

**Owners:** Ashzaeen (Advisory Agent), Samyog (Quarterly Report). **Tier:** P1 Advisory Agent, P2 Quarterly Report. **Code:** Advisory: `packages/llm/src/advisory.ts`, `apps/api/src/routes/agents.ts`, `apps/web/src/app/(app)/advisor`. Quarterly Report: `apps/api/src/reporting`, `apps/web/src/app/(app)/reports`. **PRD:** section 7.

## Scope

**Advisory Agent:** takes a Copilot event, a simulator change, or a question, and returns 2 to 3 ranked options with explicit trade-offs.

**Quarterly Report Agent:** writes a quarter-over-quarter recap from stored runs, Copilot events, and recommendations.

## You have now

The Advisor is a saved, multi-turn chat on Gemini function calling. Each turn gets a code-computed brief of the user's finances, and the model calls typed tools for everything else: transactions, spending, budgets, recurring charges and bills, income, accounts and net worth, goals, life events, Copilot scans, quarterly reports, simulation runs, the mocked portfolio and credit score, non-saving what-ifs, and Copilot-style purchase checks (`apps/api/src/advisor`). Every number in an answer must appear in what the model was given; otherwise it retries once, then shows a safe answer written in code. It is built to answer any money question from general building blocks: `simulate_scenario` models any decision (one-time and monthly changes, loans, savings changes, new or moved goals) through the real simulator, `finance_calc` covers loans, growth ranges, payoff and saving targets, and `plan_goal`, `find_savings`, and an arithmetic `calculate` tool fill the rest, each with its working shown. It drafts new goals as well as life events. Answers about a loan, a new goal or trip, investment growth, or a credit card carry an interactive visual in the chat (`apps/web/src/app/(app)/advisor/visuals`) that recomputes through `POST /v1/advisory/visuals` as the user explores. `npm run eval:advisor` measures it against about 40 varied questions with real Gemini. `web_search` answers questions about outside products, such as a card's published terms, through Google Search grounding, with a privacy check on every query. It can draft a life event from the conversation, which the user saves with Confirm. `/advisor?copilotEvent=<id>` and `?run=<id>` open a conversation about a scan or a run, and the Copilot feed links there. The ranked Advisory Agent still returns placeholder options. Quarterly reports now aggregate two stored
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
