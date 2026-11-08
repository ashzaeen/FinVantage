"use client";

import { useEffect, useState } from "react";
import { formatPercent, formatUsd } from "@finvantage/contracts";

const FORMAT = {
  usd: (n: number) => formatUsd(Math.round(n)),
  percent: (n: number) => formatPercent(n),
  number: (n: number) => Math.round(n).toLocaleString("en-US"),
} as const;

/**
 * A figure that counts up from zero when the page opens, with the same timing as the Credit
 * score gauge. The final value is exactly the one given; only the opening is animated.
 * `value` is cents for "usd", a 0-1 fraction for "percent".
 */
export function CountUp({ value, format = "usd", duration = 1200 }: { value: number; format?: keyof typeof FORMAT; duration?: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    let frame = 0;
    setShown(0);
    const delay = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        setShown(value * (1 - (1 - progress) ** 3));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 150);
    // Animation frames pause in background tabs and some browsers; always land on the real value.
    const settle = setTimeout(() => {
      cancelAnimationFrame(frame);
      setShown(value);
    }, 150 + duration + 100);
    return () => {
      clearTimeout(delay);
      clearTimeout(settle);
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return <span className="tabular-nums">{FORMAT[format](shown)}</span>;
}
