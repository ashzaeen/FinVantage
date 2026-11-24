# Voice: dictation, the call, and voice actions

Owner: dashboard. Decisions: `docs/DECISIONS.md`, "Advisor voice".

Goal: anything a person can do by hand in FinVantage, they can eventually do by voice. Dictation (phase 1) is done. The call and the actions are planned.

## Principle: voice is a way in, not a second app

Voice never gets its own logic. It speaks to the Advisor, and the Advisor acts through **tools** that call the same routes the screens call. So a feature added by hand reaches voice by adding one tool, and the safety rules (confirm, guardrail, read-only demo) apply the same way.

## Phases

| Phase | What | State |
| --- | --- | --- |
| 1 | Dictation: mic button in the Advisor box, Web Speech API, vocabulary cleanup (`src/lib/dictation.ts`, `useSpeechRecognition.ts`). Fills the box, never sends | Done |
| 2 | Spoken replies: `modality: "voice"` on advisor messages (additive), a short spoken-style prompt, `POST /v1/advisory/speak` (saved replies only, chunked), Gemini TTS through `packages/llm/src/client.ts` with the browser's voice as fallback, and a speaker toggle. Replies are read after the visitor dictated. The reply is not streamed word by word, because the guardrail checks the whole answer first (see `docs/DECISIONS.md`, "phase 2") | Done. Needs `GEMINI_MODEL_TTS` to use Gemini's voice; not yet tried against the real model |
| 3 | The call sheet: orb with listening, thinking, speaking and muted states, live captions plus chart cards, half-duplex turns with tap or Space to interrupt, 15 second silence ends a turn, 5 minute cap with a 30 second warning and a goodbye, transcript saved to the conversation | Done. Checked in headless Edge with a fake microphone and fake speech engine at 320, 390 and 1280px, light and dark. Not tried with a real microphone or Gemini voice |
| 4 | Read actions by voice (below, "Read"): `get_period_totals` for any past period, data cards beside answers, lists as top three plus the rest on request, and amounts spoken in words. Decisions: `docs/DECISIONS.md`, "phase 4" | Done. Tested with a fake model and a stubbed reply in the browser; not tried with real Gemini choosing the tool |
| 5 | Write actions by voice, propose then confirm: transactions (add, edit, recategorize, delete or hide), budgets (one, and the suggested set), goals (create, change, add money, reorder, remove), merchant rules, bulk moves, splits, a card's terms, subscription status, and the tap-only email, delete chat, clear Copilot history and delete life event. Say yes or tap to confirm, removals tap-only, undo for 30 seconds where it can be reversed (`docs/DECISIONS.md`, "phase 5"). Plus eight read-only briefings | Done. Driven in headless Edge against the real API (propose, spoken yes, spoken undo, a refused spoken yes, a tap that deletes a chat). Not tried with real Gemini choosing the tools, or a real microphone |
| 6 | Voice navigation: the call lives in the app layout and follows you as a pill; instant phrases ("open Goals", "show my Starbucks transactions") plus an `open_page` Advisor tool for vaguer requests; pages from a fixed list (`docs/DECISIONS.md`, "phase 6") | Done. Driven in headless Edge: the call survives page changes, a search fills Transactions, a model-chosen page opens, a link to another site is ignored, a proposed change brings the sheet back. Not tried with a real microphone or real Gemini |

## Three kinds of action

| Kind | Examples | Rule |
| --- | --- | --- |
| **Read** | "What did I spend on food in November?", "Show my biggest expenses", "How much income this month?", "How are my goals?" | Runs at once. Figures come from the existing summary routes and are checked by `validateGrounded` before they are spoken |
| **Write** | "Add a $42 expense at Trader Joe's", "Change that to $48", "Delete yesterday's coffee", "Create a goal", "Set a $400 food budget", "Recategorize this" | **Propose, then confirm.** The tool returns a draft card (the `draft_goal` and `draft_life_event` pattern). Nothing is saved until the person confirms. Same as rule 9 |
| **Navigate** | "Open Subscriptions", "Show the quarterly report" | Changes the page only. No data changes |

### How a write works

1. Speech becomes text. Dictation and the call both use the same text path.
2. The model picks a tool such as `draft_transaction`. Arguments come only from what the person said. A missing amount is asked for, never guessed (as `draft_life_event` already does).
3. The tool validates with the contract's Zod schema and returns a draft card plus the figures to read back.
4. The Advisor reads the draft back: "Add $42.00, Groceries, Trader Joe's, today. Confirm?"
5. The person taps Confirm, or says "yes". Spoken confirm is allowed only when the read-back included every figure. Deleting, and changes over a set size, need a tap.
6. Confirm calls the ordinary route (`addTransaction`, `updateGoal`, and so on) through the typed client. Voice adds no new write path.
7. The card shows what was saved, with Undo where the route supports it.

## Capability map

Every manual action maps to a route in `packages/contracts/src/api.ts`. Routes that exist today:

| Area | Read | Write |
| --- | --- | --- |
| Expenses and transactions | `listTransactions`, `listTopExpenses`, `getSpendingSummary`, `getSpendingBreakdown` | `addTransaction`, `updateTransaction`, `recategorizeTransaction` |
| Categories and rules | `listSpendingCategories`, `listCategoryRules` | `createSpendingCategory`, `updateSpendingCategory`, `deleteSpendingCategory`, `createCategoryRule`, `deleteCategoryRule`, `updateSpendingSplit` |
| Budgets | `listBudgets` | `setBudget`, `deleteBudget` |
| Income | `getIncomeSummary` | (income is a transaction: `addTransaction`, `updateTransaction`) |
| Goals | `listGoals` | `createGoal`, `updateGoal`, `deleteGoal` |
| Accounts | `listAccounts`, `getNetWorth` | `createAccount`, `updateAccount` |
| Subscriptions and bills | `listSubscriptions`, `listRecurring`, `listUpcomingBills` | `updateSubscription` (keep, cancelling, cancelled) |
| Life events and scenarios | `listLifeEvents`, `listLifeScenarios` | `createLifeEvent`, `deleteLifeEvent`, scenario create, update, apply, confirm, undo |
| Reports | `listReports`, `getLatestReport` | `generateReport`, `updateEmailSchedule` |

Already done by the Advisor today: drafts for goals and life events, spending and subscription reads, web search.

## Out of bounds, even by voice

- Moving money, paying a bill, applying for credit, or cancelling anything at a company. FinVantage only suggests (rule 4). "Cancelling" in the app is a status the person sets.
- Linking a bank (`createBankLinkToken`, `exchangeBankToken`, `linkSandboxBank`, `removeBankItem`). It needs a screen.
- Signing up, logging in, and `loadDemoProfile`.
- Anything in the read-only demo session. `demo_read_only` is returned as it is today, and the Advisor says so.

## Keeping "everything" true: the parity test

Add `apps/api/src/advisor/voice-parity.test.ts`. It lists every write route in the contract and requires that each one has a voice tool or is named in an exclusion list with a reason. A new screen action then fails the test until someone decides how voice handles it. This is how "everything by hand" stays true over time.

## Safety rules that apply

- Rules 1 and 2: spoken figures are computed first and pass the guardrail. This is why the call is a cascade (speech to text, the Advisor, text to speech) and not speech to speech.
- Rule 7: probabilities are spoken as ranges, and the disclaimer stays on screen.
- Rule 8: `MockedBadge` stays on screen during a call, and the Advisor says "demo data" for mocked values.
- Rule 9: no write without confirmation. Voice recognition mistakes ("fifteen" and "fifty") make this the most important rule here.
- Rule 12 and tests: every tool is tested with a fake client, as `tools.test.ts` does.
- Rate limits: the 10 a minute advisor limit assumes typing. The call needs its own budget (see `apps/api/src/rate-limit.ts`).
- Privacy: transcripts only, never audio. In Chrome, Web Speech sends audio to the browser's speech service, and the UI says so while listening.

## Open questions

- Which writes may be confirmed by voice alone, and which need a tap. Suggested: voice is fine for adds and edits that were read back in full, a tap for deletes.
- Whether to send the user's current page to the Advisor as context so "change that one" works. It would carry only the route and the selected item's id, not page text.
