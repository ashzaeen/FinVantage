"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/** True when the visitor asked the OS for less motion. Read at the moment it is needed. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Flips to `seen: true` the first time the element is at least `threshold` visible, then stops. */
export function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, seen };
}

/**
 * A timeline as a counter. `stage` is 0 until `start`, then steps to 1, 2, 3 ... after each
 * delay (ms, relative to the previous step). Bump `runKey` to replay. With reduced motion it
 * jumps straight to the last stage, so the finished state is what such a visitor sees.
 */
export function useStages(start: boolean, delays: readonly number[], runKey = 0): number {
  const [stage, setStage] = useState(0);
  const delaysKey = delays.join(",");
  useEffect(() => {
    if (!start) return;
    const steps = delaysKey.split(",").map(Number);
    if (prefersReducedMotion()) {
      setStage(steps.length);
      return;
    }
    setStage(0);
    let elapsed = 0;
    const timers = steps.map((d, i) => {
      elapsed += d;
      return window.setTimeout(() => setStage(i + 1), elapsed);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [start, delaysKey, runKey]);
  return stage;
}

/** Eases a number from 0 to `target` while `active`; lands exactly on `target`. */
export function useCountTo(target: number, active: boolean, duration = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const settle = window.setTimeout(() => setValue(target), duration + 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [target, active, duration]);
  return value;
}

/**
 * Fades and lifts its children in once, as they scroll into view. Content that is already on
 * screen at load is never hidden, and nothing is hidden without JavaScript or with reduced motion.
 */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "armed" | "in">("idle");
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("armed");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState("in");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`lp-reveal ${className}`}
      data-armed={state !== "idle"}
      data-in={state === "in"}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
