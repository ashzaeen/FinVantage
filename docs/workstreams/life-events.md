# Life-event entry

**Tier:** P0 form, P1 parser. **Code:** `apps/web/src/app/life-events`, `packages/llm/src/life-event-parser.ts`, `apps/api/src/routes/life-events.ts`. **PRD:** section 8.

## Scope

Two ways to log a life event, both producing the same record. Path 1 picks from a list and fills a guided form. Path 2 types it out, and a model converts it for confirmation.

## You have now

A working generic form, a confirmation step, and a save that starts a new run and returns goal changes. The parser exists, but reports no match until Gemini is connected.

## Start here

1. Give each event type its own guided form, with the key dollar amounts for that type.
2. Connect the parser when `GeminiClient` lands. Use a `flash` tier model with structured JSON.
3. Write test sentences, including the PRD's "we're having a baby in March".

## Done means

- Both paths write the same schema.
- "We're having a baby in March" parses to a child event with a March date and a confirmation screen.
- Cancelling leaves the data unchanged. Nothing saves before confirmation.
- Unknown events return "I could not match that" with the supported types.
- A saved event starts a new run and shows the change in goal probability.

## Depends on

`GeminiClient` for the parser, from copilot-backend. Coordinate form styling with the dashboard owner, who owns the page shell.
