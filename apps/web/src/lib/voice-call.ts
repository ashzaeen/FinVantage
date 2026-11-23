/**
 * The voice call's turn-taking, as a pure state machine so every transition can be tested. The
 * hook in `useVoiceCall.ts` does the listening, sending and speaking; this decides what is
 * allowed to happen next.
 *
 * Half-duplex: the microphone is only live in the `listening` phase. While the Advisor speaks,
 * nothing is listening, so it cannot hear and answer its own voice.
 */

/** A call lasts at most five minutes. */
export const CALL_LIMIT_MS = 5 * 60_000;
/** A notice appears this long before the end. */
export const CALL_WARN_MS = 30_000;
/** This much silence after the visitor's last word ends their turn. */
export const SILENCE_MS = 1_500;

export const GOODBYE = "That's the time limit for this call. Your conversation is saved in the chat.";
export const WARNING_NOTICE = "30 seconds left in this call.";

export type CallPhase = "listening" | "thinking" | "speaking" | "ending";

export interface CallState {
  phase: CallPhase;
  /** The microphone is switched off by the visitor. Only matters while listening. */
  muted: boolean;
  /** What the visitor has said this turn, updated live as they speak. */
  heard: string;
  /** What the Advisor last said, shown as a caption. */
  advisor: string;
  notice: string;
  warned: boolean;
  /** The time limit has passed. The call ends once the current turn is done. */
  capReached: boolean;
}

export type CallEvent =
  | { type: "heard"; text: string }
  | { type: "turnEnd" }
  | { type: "reply"; text: string }
  | { type: "replyFailed"; message: string }
  | { type: "spokeDone" }
  | { type: "interrupt" }
  | { type: "toggleMute" }
  | { type: "warn" }
  | { type: "capReached" };

export const initialCallState: CallState = {
  phase: "listening",
  muted: false,
  heard: "",
  advisor: "",
  notice: "",
  warned: false,
  capReached: false,
};

/** Back to listening, or to the goodbye if time is up. */
function next(state: CallState, patch: Partial<CallState> = {}): CallState {
  const merged = { ...state, ...patch };
  return merged.capReached
    ? { ...merged, phase: "ending", heard: "", advisor: GOODBYE, notice: "" }
    : { ...merged, phase: "listening", heard: "" };
}

export function callReducer(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case "heard":
      return state.phase === "listening" && !state.muted ? { ...state, heard: event.text, notice: "" } : state;
    case "turnEnd":
      // Nothing said yet: keep listening rather than send an empty message.
      return state.phase === "listening" && !state.muted && state.heard.trim() ? { ...state, phase: "thinking" } : state;
    case "reply":
      return state.phase === "thinking" ? { ...state, phase: "speaking", advisor: event.text } : state;
    case "replyFailed":
      return state.phase === "thinking" ? next(state, { notice: event.message }) : state;
    case "spokeDone":
      return state.phase === "speaking" ? next(state) : state;
    case "interrupt":
      return state.phase === "speaking" ? next(state) : state;
    case "toggleMute":
      return state.phase === "listening" ? { ...state, muted: !state.muted, heard: "" } : state;
    case "warn":
      return state.warned || state.capReached ? state : { ...state, warned: true, notice: WARNING_NOTICE };
    case "capReached":
      if (state.capReached || state.phase === "ending") return state;
      // Mid-turn: let the Advisor finish. Listening: say goodbye now.
      return state.phase === "listening" ? next(state, { capReached: true }) : { ...state, capReached: true, notice: "" };
  }
}

/** "4:32" from milliseconds. Rounds up, so the clock never shows 0:00 while there is time left. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
