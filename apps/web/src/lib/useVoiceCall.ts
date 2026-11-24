"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { spokenText, type AdvisorMessage } from "@finvantage/contracts";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { CALL_LIMIT_MS, CALL_WARN_MS, callReducer, GOODBYE, initialCallState, SILENCE_MS, type CallState } from "@/lib/voice-call";

export interface CallTurn {
  conversationId: string;
  reply: AdvisorMessage;
  /** Said by the app itself, such as "Saved", and not a saved Advisor reply. It is spoken with the browser's voice. */
  local?: boolean;
}

export interface VoiceCallOptions {
  /** Sends what the visitor said to the Advisor and returns its saved reply, or an error in words. */
  sendTurn: (text: string) => Promise<CallTurn | { error: string }>;
  /** Reads the reply aloud. Resolves when it has finished, or been stopped. */
  speakTurn: (turn: CallTurn) => Promise<void>;
  stopSpeaking: () => void;
  /** The call is over, by the visitor or by the time limit. */
  onClose: () => void;
}

export interface VoiceCall {
  state: CallState;
  /** The Advisor's latest reply, for its chart cards. */
  turn: CallTurn | null;
  elapsedMs: number;
  /** A problem with the microphone, in words. The call cannot continue until it is fixed. */
  micError: string;
  tapOrb: () => void;
  toggleMute: () => void;
  endCall: () => void;
}

/** Runs one voice call: listen, wait out a short silence, send, speak, repeat. Half-duplex. */
export function useVoiceCall(options: VoiceCallOptions): VoiceCall {
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const [turn, setTurn] = useState<CallTurn | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const speech = useSpeechRecognition();
  const { listening, start, cancel } = speech;

  // Callbacks change every render; effects read the latest through this ref.
  const latest = useRef(options);
  latest.current = options;
  // Each listening session gets a number, so words from one that was cancelled are ignored.
  const session = useRef(0);
  const silence = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The clock, the 30 second warning, and the limit.
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(Math.min(elapsed, CALL_LIMIT_MS));
      if (elapsed >= CALL_LIMIT_MS - CALL_WARN_MS) dispatch({ type: "warn" });
      if (elapsed >= CALL_LIMIT_MS) dispatch({ type: "capReached" });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Listening: the microphone is live only now. A turn ends after a short silence.
  const wantMic = state.phase === "listening" && !state.muted;
  useEffect(() => {
    if (wantMic) return;
    session.current += 1;
    clearTimeout(silence.current);
    cancel();
  }, [wantMic, cancel]);
  useEffect(() => {
    // Chrome ends a recognition session by itself now and then, so start another.
    if (!wantMic || listening || speech.error) return;
    const timer = setTimeout(() => {
      const mine = ++session.current;
      start((heard) => {
        if (mine !== session.current) return;
        dispatch({ type: "heard", text: heard });
        clearTimeout(silence.current);
        if (heard.trim()) {
          silence.current = setTimeout(() => {
            if (mine === session.current) dispatch({ type: "turnEnd" });
          }, SILENCE_MS);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [wantMic, listening, speech.error, start]);

  // Thinking: send what was said.
  useEffect(() => {
    if (state.phase !== "thinking") return;
    let live = true;
    void latest.current.sendTurn(state.heard).then((result) => {
      if (!live) return;
      if ("error" in result) {
        dispatch({ type: "replyFailed", message: result.error });
        return;
      }
      setTurn(result);
      dispatch({ type: "reply", text: spokenText(result.reply.content) });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new phase starts a send; `heard` is read as of that render
  }, [state.phase]);

  // Speaking: read the reply, then go back to listening.
  useEffect(() => {
    if (state.phase !== "speaking" || !turn) return;
    let live = true;
    // A voice that fails must not strand the call: carry on to the next turn either way.
    void latest.current.speakTurn(turn).catch(() => {}).finally(() => {
      if (live) dispatch({ type: "spokeDone" });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `turn` is set before the phase changes
  }, [state.phase]);

  // Ending: a short goodbye in the browser's voice, then close.
  useEffect(() => {
    if (state.phase !== "ending") return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      latest.current.onClose();
    };
    const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (!synth) {
      const timer = setTimeout(finish, 2500);
      return () => clearTimeout(timer);
    }
    const utterance = new SpeechSynthesisUtterance(GOODBYE);
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
    const backstop = setTimeout(finish, 9000);
    return () => {
      done = true;
      clearTimeout(backstop);
      synth.cancel();
    };
  }, [state.phase]);

  // Leaving the call, however it happens, stops everything.
  useEffect(() => () => {
    session.current += 1;
    clearTimeout(silence.current);
    latest.current.stopSpeaking();
  }, []);

  const tapOrb = useCallback(() => {
    if (state.phase === "speaking") {
      latest.current.stopSpeaking();
      dispatch({ type: "interrupt" });
    } else if (state.phase === "listening") {
      dispatch({ type: "turnEnd" });
    }
  }, [state.phase]);

  const toggleMute = useCallback(() => dispatch({ type: "toggleMute" }), []);

  const endCall = useCallback(() => {
    latest.current.stopSpeaking();
    latest.current.onClose();
  }, []);

  return { state, turn, elapsedMs, micError: speech.error, tapOrb, toggleMute, endCall };
}
