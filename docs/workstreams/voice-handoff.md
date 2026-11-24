# Voice: handoff (2026-11-23)

Read `docs/workstreams/voice.md` (the plan and rules) and the "Advisor voice" sections of `docs/DECISIONS.md` first. This file says exactly where the work stopped and what to do next.

## State in one paragraph

Phases 1 (dictation), 2 (spoken replies) and 3 (the voice call) are built. `npm run check` passes and the theme audit count did not rise. Phase 3 was driven end to end in headless Edge with a fake microphone and a fake speech engine at 320, 390 and 1280px, in light and dark: opening the sheet, hearing, silence ending a turn, the reply captioned and spoken in chunks, Mute, tap to send, Space to interrupt, the 30 second warning, the 5 minute goodbye and close, and Esc. **Nothing is committed.** The working tree also holds unrelated changes by teammates: do not revert or commit those as part of this work.

Phase 4 (reading data by voice) and phase 5 (changing data by voice, plus eight read-only briefings) are built too. `npm run check` passes. Nothing is committed, and the working tree also holds unrelated changes by teammates: do not revert or commit those as part of this work. Where to look:

- **Read side:** `apps/api/src/advisor/briefings.ts`, `cards.ts`, `GET /v1/spending/period` and `get_period_totals`, `speakable()` in `packages/contracts/src/speech.ts`.
- **Write side:** `packages/contracts/src/changes.ts` (the `change_draft` attachment), `apps/api/src/advisor/changes.ts`, `changes-more.ts`, `changes-tap.ts` (tools that only propose), `apps/web/src/lib/changes.ts` (saves a confirmed draft and builds its undo), `apps/web/src/app/(app)/advisor/change-store.ts`, `ChangeDraftCard.tsx`, `apps/web/src/lib/voice-intents.ts`, and `answerByVoice` in `AdvisorClient.tsx`.
- **Safety net:** `apps/api/src/advisor/voice-parity.test.ts` fails when a write route has no tool and no stated exclusion.
- **Also built along the way:** deleting and hiding transactions (a Hidden tab). The Spacetime module needs `spacetime publish` before hide and delete work on Maincloud (`apps/spacetime/README.md`).

Phase 6 (voice navigation) is built too: the call now lives in `AdvisorCallProvider` in the app layout and follows you as a pill; see `docs/DECISIONS.md`, "phase 6". **All six phases are built.** What remains is real-world checking (a real microphone, real Gemini choosing the tools, Gemini's voice with `GEMINI_MODEL_TTS`) and small follow-ups: a way to start a call from pages other than the Advisor, and deep links to a specific goal or subscription.

## What exists

| Phase | File | What |
| --- | --- | --- |
| 1 | `apps/web/src/lib/dictation.ts` (+ test) | `cleanTranscript`, `appendDictation`: wording fixes only ("28 grand" to $28,000, "four oh one k" to 401(k)) |
| 1 | `apps/web/src/lib/useSpeechRecognition.ts` | Web Speech hook. `start(onText)`, `stop()`, `cancel()`, `listening`, `supported`, `error`. Ignores `no-speech` and `aborted` |
| 2 | `packages/contracts/src/speech.ts` (+ test) | `SpeakRequest`, `SpeakResponse`, `spokenText`, `speechChunks` |
| 2 | `packages/contracts/src/advisory.ts`, `api.ts` | `SendAdvisorMessage.modality` (optional `"text" \| "voice"`), route `speakAdvisorReply` (`POST /v1/advisory/speak`) |
| 2 | `packages/llm/src/client.ts` | `speak()` on `GeminiClient` and the mock, `pcm16ToWav`, env `GEMINI_MODEL_TTS` and `GEMINI_TTS_VOICE` |
| 2 | `packages/llm/src/advisory.ts` | `voice?: boolean` on `AdvisorTurnInput`, `ADVISOR_VOICE_STYLE` |
| 2 | `apps/api/src/routes/advisor.ts`, `mount.ts`, `rate-limit.ts` | The speak route (saved Advisor replies only, chunk by part, small in-memory cache), 503 added to `HttpError`, route added to `MODEL_ROUTES` |
| 2 | `apps/api/src/app.test.ts` (end) | Two tests for spoken replies |
| 2 | `apps/web/src/lib/useSpokenReplies.ts` | Plays a reply through one persistent `Audio` element, prefetching the next chunk, with a browser-voice fallback. Exposes `enabled`, `setEnabled`, `speaking`, `prime`, `speak(conversationId, message)`, `stop` |
| 2 | `AdvisorClient.tsx` | Mic button, speaker toggle, `dictated` ref, replies spoken only after dictation |
| 3 | `apps/web/src/lib/voice-call.ts` (+ test) | **Done.** Pure reducer `callReducer` with phases `listening \| thinking \| speaking \| ending`, constants `CALL_LIMIT_MS` (5 min), `CALL_WARN_MS` (30 s), `SILENCE_MS` (1.5 s), `GOODBYE`, `formatClock` |
| 3 | `apps/web/src/lib/useVoiceCall.ts` | Drives the reducer: recognition, silence timer, send, speak, goodbye, clock |
| 3 | `apps/web/src/lib/useMicLevel.ts` | Writes mic loudness to a `--level` CSS variable for the orb |
| 3 | `apps/web/src/app/(app)/advisor/VoiceCall.tsx`, `apps/web/src/components/voice/AdvisorOrb.tsx`, end of `globals.css` | The call sheet and the orb (`.voice-*` styles, tokens only). The sheet is a dialog with a focus trap, Esc to end, Space to interrupt, and a body scroll lock |
| 3 | `AdvisorClient.tsx` | `send` now takes `{ voice, autoSpeak, restoreDraft }` and returns the saved reply or `{ error }`. `startCall`, `sendTurn`, `speakTurn` and `closeCall` drive the sheet. Call button in the input row, "Talk to Your Advisor" on the empty state, and below 640px the speaker toggle becomes a text button under the form |

## Decisions already made (do not re-ask)

Phase 1 and 2: see `docs/DECISIONS.md`. Phase 3, chosen by the dashboard owner on 2026-11-23:

| Question | Decision |
| --- | --- |
| Where the call lives | Full-screen sheet over the Advisor page. Ending it returns to the same conversation, transcript already saved |
| Center visual | **Glowing orb** (the owner first picked an avatar, then said "let's use the orb for now"). An avatar can come later |
| Turn-taking | Half-duplex: the mic is off while the Advisor speaks, because browser speech recognition cannot cancel echo. Tap the orb or press Space to interrupt |
| End of a turn | About 1.5 seconds of silence |
| On screen | Live captions for both sides, plus the Advisor's chart cards (`AdvisorVisual`) sliding in under the orb |
| Entry points | A Call button in the input row **and** a hero "Talk to Your Advisor" button on the empty state |
| The cap | 5 minutes. A timer ring, a notice at 30 seconds left, then a spoken goodbye and the call closes |

These are recorded in `docs/DECISIONS.md` ("Advisor voice, phase 3").

The owner wants every decision put to them through the `AskUserQuestion` multiple-choice prompt (their user-level `~/.claude/CLAUDE.md` says so). A new real fork in the road means asking that way.

## Gotchas

- **Do not stream raw words to speech.** `validateGrounded` checks the whole answer after the model finishes and can retry or strip sentences. Only the saved reply is spoken. This is a safety rule (root `AGENTS.md`, rules 1 and 2), not a performance choice.
- **`/v1/advisory/speak` only takes a saved reply's id**, never text. So the **goodbye line is spoken by the browser's voice** (`speechSynthesis`), not Gemini's. If the owner wants Gemini's voice for it, the clean extension is an allowlist of fixed phrases in `SpeakRequest`, cached on the server. Ask first (contract change).
- **Rate limits:** the Advisor allows 10 messages a minute per user, and `MODEL_ROUTES` allows 30 a minute (messages and speak parts share it). A call turn is one message plus one to three speak parts, so a call can't exceed about 6 turns a minute. A 429 surfaces through `sendErrorText` as "You're sending messages quickly…" and the call stays open.
- **Audio unlock:** browsers only let audio play after a click. `prime()` from `useSpokenReplies` must run inside the click that starts the call. It unlocks the one shared `Audio` element, which every later reply reuses. Don't create a second `Audio` element.
- **One hook instance of `useSpokenReplies`** lives in `AdvisorClient`; pass its functions down. `useVoiceCall` makes its own `useSpeechRecognition` (separate from the dictation instance, which is idle while a call is open).
- **`useVoiceCall` effects deliberately depend on `[state.phase]` only**, with `eslint-disable` notes. Don't "fix" them by adding the other values: a new `heard` value would re-send the message.
- **Echo/half-duplex** is enforced by the reducer (a `heard` event is ignored outside `listening`) and by `cancel()`-ing recognition whenever `wantMic` goes false. Keep both.
- **`useMicLevel` opens a second microphone stream** next to speech recognition. It's best effort: if it fails, the orb stays calm and calls still work. It only measures; nothing is recorded or sent. If a browser (Safari) makes the two streams fight, drop it and give the orb a synthetic idle animation.
- **Next.js here is not the one you know.** Read `node_modules/next/dist/docs/` before touching routing. No new route is needed for this work (the sheet is a component), so the proxy `matcher` is unaffected.
- **The mock model is the default in dev** (`LLM_PROVIDER=mock`), so Advisor replies are the "Safe Answer" fallback and `/v1/advisory/speak` returns 503 `voice_unavailable`. That path ends in the browser-voice fallback and is how it was verified. For real replies and Gemini's voice, set `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL_FLASH` and `GEMINI_MODEL_TTS` in the root `.env` and restart the API.

## How to verify in a browser

There is no browser tool in every session, and headless Chromium has no real microphone. A working approach that needs only Node 24 and Edge: start Edge with `--headless=new --remote-debugging-port=9333 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, connect with Node's built-in `WebSocket` to the DevTools protocol, and use `Page.addScriptToEvaluateOnNewDocument` to install a fake `webkitSpeechRecognition` (store the instance on `window.__fake` and drive it with `onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "..." } }] })`) and a fake speech synthesis. `window.speechSynthesis` is read-only, so install the fake with `Object.defineProperty(window, "speechSynthesis", { configurable: true, value: ... })`; assigning to it is silently ignored and the real one then rejects your fake utterance. Set `localStorage["fv-theme"]` for dark mode. To test the 30 second warning and the cap without waiting, shift `Date.now` forward by about 272 and 301 seconds; `useVoiceCall` reads the clock from it. Delay each fake utterance's `onend` by about a second or the whole reply finishes before you look. Dev servers must be running (`npm run dev`). The "Viewport argument key interactive-widget" console error is pre-existing, and the round "N" badge is Next's dev overlay.

## Not verified yet

- Anything with a **real microphone** or real speech recognition (Chrome or Edge; Safari untested). In particular, whether the second measure-only mic stream in `useMicLevel` coexists with recognition on every browser. If not, drop it and give the orb a synthetic idle animation.
- **Gemini TTS against the real API.** The request shape (`responseModalities: ["AUDIO"]`, a prebuilt voice, raw PCM wrapped as WAV) is unit-tested against a fake, not Google. The model name must be confirmed at the Google Cloud sponsor table (`packages/llm/AGENTS.md`).
- A call with a **real model reply that includes chart cards**: the dev setup uses the mock model, so the cards region was not exercised with an `AdvisorVisual`.
- The tap-the-orb behaviour while *thinking* (it does nothing, by design) and a 429 during a call.
- 768px width and the call on a touch device.

## Later phases (see `voice.md`)

5: write actions by voice (propose, then confirm, like `draft_goal`; a parity test so every write route has a voice tool or a stated exclusion); 6: voice navigation. Open question from `voice.md`: which writes may be confirmed by saying "yes" and which need a tap.

## Commands

```bash
npm run check                       # typecheck + all tests, from the repo root
npm test -w @finvantage/web         # includes the theme audit
npm test -w @finvantage/api
npm test -w @finvantage/llm
npm test -w @finvantage/contracts
npm run dev                         # API :4000, web :3000
```

## Phase 5 plan (decided 2026-11-23, built the same day; kept for the reasoning)

- **The Advisor never writes.** Each write is a tool that returns a `change_draft` attachment (a validated request plus a read-back sentence); the browser saves it through the ordinary route on Confirm, as `GoalDraftCard` does today. Needed: a `change_draft` attachment in `advisory.ts`, a card in chat and on the call sheet, an executor and an undo, and a spoken "yes" or "no" handled locally in the call (not sent to the model) only for non-destructive drafts.
- **Actions:** add expense or income (`addTransaction`), edit or recategorize a transaction (`updateTransaction`), set or remove a budget, create (`draft_goal` exists), change or remove a goal, set a subscription's status. Removing a goal or budget is tap-only.
- **Ambiguity is decided in code:** an edit tool takes selectors (merchant, date range, amount), not an id. Zero or several matches return a candidates card and the Advisor asks which; one match returns a draft. Earlier tool results are not replayed in history, so a follow-up re-searches.
- **Read-back is code-written:** in voice mode the reply for a drafting turn is the draft's `readBack` sentence plus "Say yes to save it, or no to cancel", not the model's wording.
- **Undo:** adds are undone with `removeTransaction` (it deletes manual rows); edits restore the previous body (carry it on the draft); budget and goal changes likewise.
- **Amounts must be stated by the user** (as `draft_life_event` does with `isGrounded`). Edits are full-body `PATCH`es, so read the row first.
- **Parity test** `apps/api/src/advisor/voice-parity.test.ts`: every write route in the contract has a voice tool or a named exclusion with a reason.
- A shared demo token is read-only, so a write returns `demo_read_only`; say so plainly.

### Phase 5 final scope (chosen 2026-11-23, after the first plan; all three slices are built)

Write actions, all propose then confirm, in three slices:

| Slice | Actions | Confirm |
| --- | --- | --- |
| 1 | Add expense or income; edit or recategorize a transaction; set or remove a budget; create, change or remove a goal; set a subscription's status | Yes or tap; removing a goal or budget is tap-only |
| 2 | Add money to a goal; reprioritize goals; always categorize a merchant (`createCategoryRule`); bulk recategorize a merchant's charges (`bulkRecategorizeTransactions`, read back the row count); split a transaction (`splitTransaction`); update an account's APR or minimum payment (`updateAccount`); set several budgets at once from `listBudgetSuggestions` (one batch card) | Yes or tap |
| 3 | Email the quarterly report; delete an Advisor chat; clear Copilot history; delete a life event | Tap only |

Read-only briefings to add to the Advisor's tools (phase 4 style, with a data card): safe to spend (`getSafeToSpend`), upcoming bills and the money calendar, health score and the attention feed, debt payoff (`getDebtPayoff`) and credit what-if (credit parts mocked, so say so and show `MockedBadge`), unusual charges and spending pace.

Left out: bank link, sync setup and removal, sign-in, custom category management, investment target mix. Refresh-bank, Copilot on or off and drafting a cancellation message were offered as safe extras but not chosen.

The parity test lists the routes above as covered and every other write route as excluded with a reason.
