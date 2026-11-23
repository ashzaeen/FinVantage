# Voice: handoff (2026-11-23)

Read `docs/workstreams/voice.md` (the plan and rules) and the "Advisor voice" sections of `docs/DECISIONS.md` first. This file says exactly where the work stopped and what to do next.

## State in one paragraph

Phase 1 (dictation) and phase 2 (spoken replies) are built, tested and verified in a browser. Phase 3 (the voice call) is **half built**: the call's logic is written and tested, but there is **no UI yet and nothing is wired into the Advisor page**. `npm run check` passed after phase 2. After the phase 3 files were added, `npm run typecheck -w @finvantage/web` and `npm test -w @finvantage/web` passed; the full `npm run check` has not been re-run. **Nothing is committed.** The working tree also holds unrelated changes by teammates (charts, planning, insights, theme work): do not revert or commit those as part of this work.

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
| 3 | `apps/web/src/lib/useVoiceCall.ts` | **Written, never run.** Drives the reducer: recognition, silence timer, send, speak, goodbye, clock |
| 3 | `apps/web/src/lib/useMicLevel.ts` | **Written, never run.** Writes mic loudness to a `--level` CSS variable for the orb |

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

Record these in `docs/DECISIONS.md` ("Advisor voice, phase 3") when the UI ships. Not yet recorded there.

The owner wants every decision put to them through the `AskUserQuestion` multiple-choice prompt (their user-level `~/.claude/CLAUDE.md` says so). A new real fork in the road means asking that way.

## What is left for phase 3, in order

### 1. `AdvisorClient.tsx`: make `send` usable by the call

`send(text, conversationId, newSituation, voice)` currently returns nothing. Change it to:

- Take an options object as the 4th argument: `{ voice?: boolean; autoSpeak?: boolean; restoreDraft?: boolean }`, defaults `voice = false`, `autoSpeak = voice`, `restoreDraft = true`. Update the two existing callers (`submit` passes `{ voice, autoSpeak: voice }`; the opening-question effect passes nothing).
- Return `Promise<{ conversationId: string; reply: Message } | { error: string }>`. Success: the id and the saved reply. Failure (the `catch`): `{ error: sendErrorText(err) }`. An empty message returns `{ error: "" }`.
- Only call `setDraft(content)` on failure when `restoreDraft` is true (the call must not refill the text box).
- Only call `speakReply` when `voice && autoSpeak`.
- Keep an `activeRef` mirror of `activeId` (set when a conversation is created inside `send`, and in `open` and `startNew`), because the call's `sendTurn` runs from a long-lived closure.
- Add `calling` state, `startCall()` (`prime()`, `stopReply()`, `setCalling(true)`), and:
  - `sendTurn = (text) => send(text, activeRef.current, null, { voice: true, autoSpeak: false, restoreDraft: false })`
  - `speakTurn = (turn) => speakReply(turn.conversationId, turn.reply)`
- Render `{calling && <VoiceCall ... />}` with `sendTurn`, `speakTurn`, `stopSpeaking={stopReply}` and `onClose={() => { setCalling(false); scrollDown(); }}`.

### 2. UI for the call

- **`apps/web/src/components/voice/AdvisorOrb.tsx`**: a `div.voice-orb` with `data-state` (`listening | thinking | speaking | muted`) and children `__glow`, `__core`, `__swirl`, plus two `__ripple` rings for speaking. It takes a ref so `useMicLevel(wantMic, ref)` can set `--level`.
- **Orb CSS**: append a "Voice call" block at the **end** of `apps/web/src/app/globals.css` (other people are editing that file, so append, don't rewrite). Use only token variables and `color-mix()` (no hex, no `rgba(`, or `npm run theme:audit` fails). States: listening breathes and scales with `--level`; thinking spins a conic swirl; speaking pulses with ripples; muted dims. Honour `prefers-reduced-motion`. Add a `.voice-sheet` background wash.
- **`apps/web/src/app/(app)/advisor/VoiceCall.tsx`**: the sheet. Use `useVoiceCall`. Layout:
  - `role="dialog" aria-modal="true"`, fixed to the screen, above the app shell (`z-[70]`), padded with `env(safe-area-inset-*)`, `dvh` not `vh`.
  - Header: "Advisor" and a time-left chip from `formatClock(CALL_LIMIT_MS - elapsedMs)`.
  - Center: the orb **as a `<button>`** (autofocus it) calling `tapOrb`, inside an SVG progress ring (`pathLength=100`, stroke `var(--accent-ink)`, switching to `var(--warning)` in the last 30 s). State label under it ("Listening…", "Thinking…", "Speaking…", "Muted"), with a hint ("Tap to send now" or "Tap to interrupt").
  - Captions: the visitor's live words (`state.heard`, muted style) and the Advisor's (`state.advisor`).
  - Cards: for `turn?.reply.attachments` of `kind === "visual"`, render `<AdvisorVisual key id={`${reply.id}:${i}`} visual={a.visual} />` (see `AdvisorMessage.tsx` line ~111). Scrollable region on phones.
  - Footer: Mute button (`Mic` / `MicOff`), a clearly red End Call button, and the line "Educational guidance, not financial advice."
  - `state.notice` in a `role="status"` line; `micError` in a `role="alert"` line (the call cannot continue then, so End Call should be obvious).
  - Esc ends the call. **Do not autofocus End Call**: Space on a focused button activates it, and Space is meant to interrupt. Autofocus the orb button instead.
  - Lock page scroll while open; restore on close.
  - Labels in Title Case (`apps/web/AGENTS.md`), 44px touch targets on phones (`max-lg:h-11 max-lg:w-11`), token classes only.
- **Entry points in `AdvisorClient.tsx`**:
  - A `Phone` icon button in the input row, after the mic, `aria-label="Start Voice Call"`, shown only when `speech.supported`.
  - A prominent "Talk to Your Advisor" button on the empty state (above the starter cards), same condition.
  - **Phone width problem:** at 390px the row holds the textarea plus buttons in 327px. Three 44px buttons fit with the placeholder "Ask your Advisor…" (already shortened). A fourth does not. So hide the speaker toggle in the row below `sm` (`hidden sm:flex`) and add a small `sm:hidden` text button under the form ("Spoken Replies: On/Off", `min-h-11`) that does the same job. Check it at 320, 390 and 768px.

### 3. Tests, docs, checks

- `npm run check` from the repo root must pass.
- `npm run theme:audit -w @finvantage/web` runs inside `npm test`; the hardcoded-colour count must not rise.
- Add to `apps/web/AGENTS.md`'s layout table: `voice-call.ts`, `useVoiceCall.ts`, `useMicLevel.ts`, `VoiceCall.tsx`, `AdvisorOrb.tsx`.
- Add the "Advisor voice, phase 3" decisions table to `docs/DECISIONS.md` and flip phase 3 to Done in `docs/workstreams/voice.md`.
- Say plainly in the final report what is still a stub (see "Not verified", below).

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

The Playwright browser used here has **no** `SpeechRecognition` and **no** `speechSynthesis`, so the mic and call buttons are hidden (correctly). Inject fakes, then remount the page with a client-side navigation so the hooks re-detect support:

```js
class Fake { start(){ window.__fake = this; } stop(){ this.onend && this.onend(); } abort(){ this.onend && this.onend(); } }
window.webkitSpeechRecognition = Fake;
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
window.speechSynthesis = { speak: (u) => setTimeout(() => u.onend && u.onend(), 50), cancel: () => {} };
window.next.router.push('/goals'); // wait ~2.5s
window.next.router.push('/advisor'); // wait ~2.5s
// then drive speech:
window.__fake.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "how are my budgets" } }] });
```

Pushing the router right after load can cause a harmless "state update before mount" console error; reload and check a clean load before trusting it. The "Viewport argument key interactive-widget" error is pre-existing. Take screenshots at 390px and desktop, in light and dark mode (`localStorage` key `fv-theme`). Delete screenshots you save in the repo root.

## Not verified yet

- Anything with a **real microphone** or real speech recognition (Chrome or Edge; Safari untested).
- **Gemini TTS against the real API.** The request shape (`responseModalities: ["AUDIO"]`, a prebuilt voice, raw PCM wrapped as WAV) is unit-tested against a fake, not Google. The model name must be confirmed at the Google Cloud sponsor table (`packages/llm/AGENTS.md`).
- `useVoiceCall`, `useMicLevel`: type-checked only, never executed. The reducer they drive is tested.
- Phase 3 UI at 320, 390, 768 and in dark mode: nothing built to look at yet.

## Later phases (see `voice.md`)

4: read actions by voice; 5: write actions by voice (propose, then confirm, like `draft_goal`; a parity test so every write route has a voice tool or a stated exclusion); 6: voice navigation. Open question from `voice.md`: which writes may be confirmed by saying "yes" and which need a tap.

## Commands

```bash
npm run check                       # typecheck + all tests, from the repo root
npm test -w @finvantage/web         # includes the theme audit
npm test -w @finvantage/api
npm test -w @finvantage/llm
npm test -w @finvantage/contracts
npm run dev                         # API :4000, web :3000
```
