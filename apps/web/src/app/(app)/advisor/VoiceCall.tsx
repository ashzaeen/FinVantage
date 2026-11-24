"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Maximize2, Mic, MicOff, PhoneOff } from "lucide-react";
import { AdvisorOrb, type OrbState } from "@/components/voice/AdvisorOrb";
import { useMicLevel } from "@/lib/useMicLevel";
import type { CallTurn, VoiceCall as RunningCall } from "@/lib/useVoiceCall";
import { CALL_LIMIT_MS, CALL_WARN_MS, formatClock } from "@/lib/voice-call";
import { ChangeDraftCard } from "./ChangeDraftCard";
import { DataCard } from "./DataCard";
import { AdvisorVisual } from "./visuals/AdvisorVisual";

/** What the visitor is told under the orb, and what a tap on it will do. */
function describe(phase: string, muted: boolean, micError: string): { label: string; hint: string } {
  if (micError) return { label: "Microphone Unavailable", hint: "End the call, fix the microphone, and try again." };
  if (phase === "thinking") return { label: "Thinking…", hint: "Looking through your numbers" };
  if (phase === "speaking") return { label: "Speaking…", hint: "Tap the orb or press Space to interrupt" };
  if (phase === "ending") return { label: "Call Ending", hint: "Your conversation is saved in the chat" };
  if (muted) return { label: "Muted", hint: "Unmute to keep talking" };
  return { label: "Listening…", hint: "Tap the orb to send now" };
}

/**
 * The voice call, as a full-screen sheet or, minimized, a small pill that stays on every page. The
 * orb shows who has the floor, captions show both sides, and any chart, figures or change the
 * Advisor proposes appear beneath. Turn-taking is half-duplex (see `voice-call.ts`): the
 * microphone is off while the Advisor thinks or speaks. The call itself runs in the app layout, so
 * opening another page does not end it.
 */
export function VoiceCall({ call, minimized, onMinimize, onExpand }: { call: RunningCall; minimized: boolean; onMinimize: () => void; onExpand: () => void }) {
  const { state, turn, elapsedMs, micError, tapOrb, toggleMute, endCall } = call;
  const orbRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const orbButton = useRef<HTMLButtonElement>(null);

  // The pill and the sheet have an orb each, so the level has to follow whichever is showing.
  useMicLevel(state.phase === "listening" && !state.muted && !micError, orbRef, minimized);

  // On the sheet: focus the orb, give focus back when it closes, keep the page behind from
  // scrolling, and keep Tab inside. The pill leaves the page alone.
  useEffect(() => {
    if (minimized) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    orbButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [minimized]);

  useEffect(() => {
    if (minimized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        endCall();
        return;
      }
      if (e.code === "Space") {
        // A focused button handles its own Space press; anywhere else Space means "interrupt".
        // The target can be the window or document, which are not elements.
        if (e.target instanceof Element && e.target.closest("button, a, input, textarea, select, [role='slider']")) return;
        e.preventDefault();
        tapOrb();
        return;
      }
      if (e.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [minimized, endCall, tapOrb]);

  const orbState: OrbState = micError ? "muted" : state.phase === "listening" && state.muted ? "muted" : state.phase;
  const { label, hint } = describe(state.phase, state.muted, micError);
  const remaining = Math.max(0, CALL_LIMIT_MS - elapsedMs);
  const closing = remaining <= CALL_WARN_MS;

  if (minimized) {
    return (
      <div
        role="region"
        aria-label="Voice call in progress"
        data-call-pill
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[60] flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-card p-1.5 shadow-xl"
      >
        <button
          type="button"
          onClick={onExpand}
          aria-label="Open the Call"
          className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-full py-0.5 pl-1 pr-3 text-left transition hover:bg-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <span className="relative block h-9 w-9 shrink-0">
            <AdvisorOrb state={orbState} orbRef={orbRef} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{label}</span>
            <span className={`block text-xs tabular-nums ${closing ? "text-warning-text" : "text-muted"}`}>{formatClock(remaining)} left</span>
          </span>
        </button>
        <button
          type="button"
          onClick={toggleMute}
          disabled={state.phase !== "listening" || !!micError}
          aria-pressed={state.muted}
          aria-label={state.muted ? "Unmute" : "Mute"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.muted ? <MicOff size={17} aria-hidden /> : <Mic size={17} aria-hidden />}
        </button>
        <button type="button" onClick={onExpand} aria-label="Expand the Call" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-inset">
          <Maximize2 size={16} aria-hidden />
        </button>
        <button type="button" onClick={endCall} aria-label="End Call" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-critical bg-critical-bg text-loss transition hover:brightness-95">
          <PhoneOff size={17} aria-hidden />
        </button>
      </div>
    );
  }

  const visuals = turn ? visualsOf(turn) : [];
  const cards = turn ? cardsOf(turn) : [];
  const drafts = turn ? draftsOfTurn(turn) : [];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Voice Call With Your Advisor"
      className="voice-sheet fixed inset-0 z-[70] flex flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-ink"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <h2 className="font-poppins text-lg font-bold text-ink">Advisor</h2>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${closing ? "bg-warning-bg text-warning-text" : "bg-accent-soft text-accent-ink"}`}
            role="timer"
            aria-label={`Time left: ${formatClock(remaining)}`}
          >
            {formatClock(remaining)} Left
          </span>
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize the Call"
            title="Keep the call going while you look around"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink transition hover:bg-inset lg:h-9 lg:w-9"
          >
            <ChevronDown size={18} aria-hidden />
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-4 pb-4 sm:px-6">
        <div className="my-auto flex w-full max-w-2xl flex-col items-center gap-4 pt-2">
          <div className="relative aspect-square" style={{ width: "clamp(10rem, 32dvh, 16rem)" }}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r="48.5" fill="none" strokeWidth="1.2" style={{ stroke: "var(--border)" }} />
              <circle
                cx="50"
                cy="50"
                r="48.5"
                fill="none"
                strokeWidth="1.8"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${(remaining / CALL_LIMIT_MS) * 100} 100`}
                style={{ stroke: closing ? "var(--warning)" : "var(--accent-ink)", transition: "stroke-dasharray 300ms linear" }}
              />
            </svg>
            <button
              ref={orbButton}
              type="button"
              onClick={tapOrb}
              aria-label={state.phase === "speaking" ? "Interrupt the Advisor" : "Send What You Said Now"}
              className="absolute inset-[9%] rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink"
            >
              <AdvisorOrb state={orbState} orbRef={orbRef} />
            </button>
          </div>

          <div className="text-center">
            <p className="font-poppins text-lg font-bold text-ink">{label}</p>
            <p className="mt-0.5 text-sm text-muted">{hint}</p>
          </div>

          <div className="w-full space-y-2 text-center" aria-label="Captions">
            <p className="min-h-6 text-base text-muted" aria-live="off">
              {state.heard ? `“${state.heard}”` : ""}
            </p>
            <p className="min-h-6 text-base leading-7 text-ink" aria-live="polite">
              {state.advisor}
            </p>
          </div>

          {micError && <p role="alert" className="rounded-xl bg-critical-bg px-3 py-2.5 text-center text-sm text-loss">{micError}</p>}
          {state.notice && !micError && <p role="status" className="rounded-xl bg-warning-bg px-3 py-2 text-center text-sm text-warning-text">{state.notice}</p>}
        </div>

        {(drafts.length > 0 || cards.length > 0 || visuals.length > 0) && (
          <div className="voice-card-in w-full max-w-3xl space-y-3 pb-2">
            {drafts.map((d) => <ChangeDraftCard key={d.key} id={d.key} draft={d.draft} voice />)}
            {cards.map((c) => <DataCard key={c.key} card={c.card} />)}
            {visuals.map((v) => <AdvisorVisual key={v.key} id={v.key} visual={v.visual} />)}
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-line px-4 pb-3 pt-3 sm:px-6">
        <div className="mx-auto flex max-w-md items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            disabled={state.phase !== "listening" || !!micError}
            aria-pressed={state.muted}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-ink transition hover:bg-inset disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.muted ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
            {state.muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={endCall}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-critical bg-critical-bg px-4 text-sm font-bold text-loss transition hover:brightness-95"
          >
            <PhoneOff size={16} aria-hidden /> End Call
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Say &quot;open Goals&quot; to look around while we talk. Educational guidance, not financial advice. Your browser&apos;s speech service hears the audio during the call. Esc ends the call.
        </p>
      </footer>
    </div>
  );
}

/** Changes the Advisor proposed in its latest reply, waiting for the user's yes or tap. */
function draftsOfTurn(turn: CallTurn) {
  return turn.reply.attachments.flatMap((a, i) => (a.kind === "change_draft" ? [{ key: `${turn.reply.id}:${i}`, draft: a }] : []));
}

/** The data cards attached to the Advisor's latest reply: the figures behind what it said. */
function cardsOf(turn: CallTurn) {
  return turn.reply.attachments.flatMap((a, i) => (a.kind === "data_card" ? [{ key: `${turn.reply.id}:${i}`, card: a }] : []));
}

/** The interactive charts attached to the Advisor's latest reply. */
function visualsOf(turn: CallTurn) {
  return turn.reply.attachments.flatMap((a, i) => (a.kind === "visual" ? [{ key: `${turn.reply.id}:${i}`, visual: a.visual }] : []));
}
