"use client";

import { useEffect, type RefObject } from "react";

/**
 * Writes the microphone's loudness (0 to 1) into `--level` on `target`, about 30 times a second,
 * so the orb can ripple with the visitor's voice. It sets a CSS variable instead of React state,
 * so nothing re-renders. The audio is only measured, never recorded or sent anywhere.
 *
 * Best effort: if the browser will not give a second microphone stream, the orb simply stays
 * calm. Speech recognition does not depend on this.
 */
export function useMicLevel(active: boolean, target: RefObject<HTMLElement | null>, rekey?: unknown) {
  useEffect(() => {
    const el = target.current;
    if (!active || !el || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(s).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let smooth = 0;
        let last = 0;
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick);
          if (now - last < 33) return;
          last = now;
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += ((v - 128) / 128) ** 2;
          const rms = Math.sqrt(sum / samples.length);
          // Quiet rooms sit near 0.01, speech reaches 0.1 to 0.3. Rise fast, fall slowly.
          const level = Math.min(1, rms * 4.5);
          smooth = level > smooth ? level : smooth * 0.85 + level * 0.15;
          el.style.setProperty("--level", smooth.toFixed(3));
        };
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
      el.style.setProperty("--level", "0");
    };
  }, [active, target, rekey]);
}
