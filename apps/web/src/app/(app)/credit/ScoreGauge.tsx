"use client";

import { useEffect, useState } from "react";

export function ScoreGauge({ score }: { score: number }) {
  const min = 300, max = 850;
  const targetPct = Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100));
  const label = score >= 800 ? "Exceptional" : score >= 740 ? "Very Good" : score >= 670 ? "Good" : score >= 580 ? "Fair" : "Poor";
  const color = score >= 740 ? "#0b8f69" : score >= 670 ? "#c47708" : "#d7465d";
  const circumference = 2 * Math.PI * 83;

  const [animPct, setAnimPct] = useState(0);
  const [displayScore, setDisplayScore] = useState(min);
  useEffect(() => {
    // Small delay so the animation is visible after page paint
    const t = setTimeout(() => {
      const duration = 1200;
      const start = performance.now();
      function tick(now: number) {
        const elapsed = now - start;
        const progress = Math.min(1, elapsed / duration);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setAnimPct(targetPct * eased);
        setDisplayScore(Math.round(min + (score - min) * eased));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, 150);
    return () => clearTimeout(t);
  }, [score, targetPct]);

  return (
    <div className="flex flex-col items-center justify-center py-3">
      <div className="relative h-44 w-44">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label={`Credit score ${score} out of ${max}`}>
          <circle cx="100" cy="100" r="83" fill="none" stroke="#edf0f7" strokeWidth="14" />
          <circle
            cx="100" cy="100" r="83"
            fill="none" stroke={color} strokeWidth="14"
            strokeDasharray={`${circumference * animPct / 100} ${circumference}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8d94a8]">FICO</span>
          <span className="font-poppins text-3xl font-bold tracking-tight text-[#16192c] tabular-nums">{displayScore}</span>
          <span
            className="mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-opacity duration-500"
            style={{ color, backgroundColor: `${color}18`, opacity: animPct > targetPct * 0.8 ? 1 : 0 }}
          >
            {label}
          </span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[#8d94a8]">{min}–{max}</p>
    </div>
  );
}
