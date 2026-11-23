"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanTranscript } from "./dictation";

/** The slice of the browser's SpeechRecognition API used here. TypeScript's DOM types omit it. */
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What went wrong, in words the visitor can act on. `no-speech` and `aborted` are not errors. */
export function dictationErrorText(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Microphone access is blocked. Allow it in your browser's site settings, then try again.";
  if (code === "audio-capture") return "No microphone was found. Check that one is connected.";
  if (code === "network") return "Dictation needs an internet connection. You can still type your message.";
  return "Dictation stopped unexpectedly. You can still type your message.";
}

export interface SpeechRecognitionState {
  /** False on the server, in the first render, and in browsers without speech recognition. */
  supported: boolean;
  listening: boolean;
  error: string;
  /** Starts listening. `onText` gets the whole dictated text so far, cleaned, each time it changes. */
  start: (onText: (text: string) => void) => void;
  /** Stops and keeps what was heard. */
  stop: () => void;
  /** Stops and throws away the session. The caller restores its own text. */
  cancel: () => void;
}

export function useSpeechRecognition(lang = "en-US"): SpeechRecognitionState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);

  // Checked after mount, so the server render and the first client render agree.
  useEffect(() => setSupported(recognitionCtor() !== null), []);
  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback((onText: (text: string) => void) => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    setError("");
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += `${e.results[i][0].transcript} `;
      onText(cleanTranscript(heard));
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(dictationErrorText(e.error));
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setError(dictationErrorText("unknown"));
    }
  }, [lang]);

  const stop = useCallback(() => recognition.current?.stop(), []);
  const cancel = useCallback(() => {
    const r = recognition.current;
    if (!r) return;
    r.onresult = null;
    r.abort();
  }, []);

  return { supported, listening, error, start, stop, cancel };
}
