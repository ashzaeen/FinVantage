"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speechChunks, type AdvisorMessage, type SpeakResponse } from "@finvantage/contracts";
import { api } from "@/lib/api";

const STORAGE_KEY = "fv-voice-replies";
/** A silent, empty WAV. Playing it inside a click unlocks audio on browsers that block it otherwise. */
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** Speaks `chunks` with the browser's own voice. Resolves when done, or as soon as it is cancelled. */
function browserSpeak(chunks: string[], isCurrent: () => boolean): Promise<void> {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || chunks.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (!isCurrent() || i >= chunks.length) return resolve();
      const utterance = new SpeechSynthesisUtterance(chunks[i++]);
      utterance.onend = next;
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    };
    next();
  });
}

export interface SpokenReplies {
  /** The visitor's choice to have replies read aloud after they dictate. Remembered on this device. */
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  speaking: boolean;
  /** Call inside the click that sends a message, so the browser lets audio play when the reply comes. */
  prime: () => void;
  /** Reads a saved reply aloud: Gemini's voice through the API, or the browser's voice if that fails. */
  speak: (conversationId: string, message: AdvisorMessage) => Promise<void>;
  stop: () => void;
}

export function useSpokenReplies(): SpokenReplies {
  const [enabled, setEnabledState] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  // Each reply gets a number. Starting another reply or calling stop() makes the old one stale.
  const run = useRef(0);

  useEffect(() => {
    try {
      setEnabledState(window.localStorage.getItem(STORAGE_KEY) !== "off");
    } catch {
      // Blocked storage: keep the default.
    }
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    audio.current?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);
  useEffect(() => stop, [stop]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    if (!on) stop();
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // The choice still holds for this visit.
    }
  }, [stop]);

  const prime = useCallback(() => {
    if (!audio.current) audio.current = new Audio();
    audio.current.src = SILENCE;
    audio.current.play().catch(() => {});
  }, []);

  const speak = useCallback(async (conversationId: string, message: AdvisorMessage) => {
    if (!audio.current) audio.current = new Audio();
    const player = audio.current;
    const id = ++run.current;
    const isCurrent = () => run.current === id;
    setSpeaking(true);

    const fetchPart = (part: number): Promise<SpeakResponse | null> =>
      api.speakAdvisorReply({ body: { conversationId, messageId: message.id, part } }).catch(() => null);
    const play = (part: SpeakResponse) =>
      new Promise<void>((resolve) => {
        player.onended = () => resolve();
        player.onerror = () => resolve();
        player.src = `data:${part.mimeType};base64,${part.audioBase64}`;
        player.play().catch(() => resolve());
      });

    try {
      const first = await fetchPart(0);
      const chunks = speechChunks(message.content);
      if (!first) {
        await browserSpeak(chunks, isCurrent);
        return;
      }
      let current: SpeakResponse = first;
      for (let i = 0; i < first.parts; i++) {
        if (!isCurrent()) return;
        // Ask for the next part while this one plays, so there is no gap between them.
        const upcoming: Promise<SpeakResponse | null> | null = i + 1 < first.parts ? fetchPart(i + 1) : null;
        await play(current);
        if (!isCurrent() || !upcoming) continue;
        const next: SpeakResponse | null = await upcoming;
        if (!next) {
          await browserSpeak(chunks.slice(i + 1), isCurrent);
          return;
        }
        current = next;
      }
    } finally {
      if (isCurrent()) setSpeaking(false);
    }
  }, []);

  return { enabled, setEnabled, speaking, prime, speak, stop };
}
