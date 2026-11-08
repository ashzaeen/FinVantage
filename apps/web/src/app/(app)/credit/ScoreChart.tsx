"use client";

import { useState } from "react";

export function ScoreChart({ history }: { history: Array<{ date: string; score: number }> }) {
  const [hover, setHover] = useState<number | null>(null);

  if (history.length < 2) return null;

  const scores = history.map((h) => h.score);
  const lo = Math.min(...scores) - 8;
  const hi = Math.max(...scores) + 8;
  const w = 360, h = 120, padX = 32, padTop = 16, padBot = 28;

  const coords = history.map((pt, i) => ({
    x: padX + (i / (history.length - 1)) * (w - padX * 2),
    y: padTop + ((hi - pt.score) / (hi - lo)) * (h - padTop - padBot),
    score: pt.score,
    date: pt.date,
  }));

  // Smooth cubic bezier path
  let linePath = `M${coords[0].x},${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const cpx = (prev.x + cur.x) / 2;
    linePath += ` C${cpx},${prev.y} ${cpx},${cur.y} ${cur.x},${cur.y}`;
  }

  const areaPath = `${linePath} L${coords[coords.length - 1].x},${h - padBot} L${coords[0].x},${h - padBot} Z`;

  const first = history[0];
  const last = history[history.length - 1];
  const change = last.score - first.score;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-[#f8f9fe]">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-xs font-semibold text-[#16192c]">Score History</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${change >= 0 ? "bg-[#e6faf4] text-[#00c48c]" : "bg-[#ffecee] text-[#ff4d6d]"}`}>
          {change >= 0 ? "+" : ""}{change} pts
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label="Score history chart"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#544af7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#544af7" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => {
          const gy = padTop + frac * (h - padTop - padBot);
          return <line key={frac} x1={padX} y1={gy} x2={w - padX} y2={gy} stroke="#d4d2f0" strokeWidth="0.5" strokeDasharray="4 3" />;
        })}
        {/* Area fill */}
        <path d={areaPath} fill="url(#scoreGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#544af7" strokeWidth="2" strokeLinecap="round" />
        {/* Hover vertical line */}
        {hover !== null && (
          <line x1={coords[hover].x} y1={padTop} x2={coords[hover].x} y2={h - padBot} stroke="#544af7" strokeWidth="1" strokeDasharray="3 2" opacity="0.4" />
        )}
        {/* Data points */}
        {coords.map((c, i) => (
          <g key={c.date}>
            <circle cx={c.x} cy={c.y} r={hover === i ? 4.5 : 3} fill={hover === i ? "#544af7" : "white"} stroke="#544af7" strokeWidth="1.5" className="transition-all duration-150" />
            {/* Invisible hit area */}
            <rect
              x={c.x - (w / history.length) / 2}
              y={0}
              width={w / history.length}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "pointer" }}
            />
          </g>
        ))}
        {/* Tooltip */}
        {hover !== null && (() => {
          const c = coords[hover];
          const label = new Date(c.date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
          const tooltipW = 72, tooltipH = 32;
          let tx = c.x - tooltipW / 2;
          if (tx < 4) tx = 4;
          if (tx + tooltipW > w - 4) tx = w - 4 - tooltipW;
          const ty = c.y - tooltipH - 8;
          return (
            <g>
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx="6" fill="#16192c" />
              <text x={tx + tooltipW / 2} y={ty + 13} textAnchor="middle" fontSize="8" fill="#8d94a8" fontFamily="Roboto, sans-serif">{label}</text>
              <text x={tx + tooltipW / 2} y={ty + 25} textAnchor="middle" fontSize="11" fill="white" fontWeight="bold" fontFamily="Poppins, sans-serif">{c.score}</text>
            </g>
          );
        })()}
        {/* Month labels */}
        {coords.map((c, i) => (
          <text key={`label-${c.date}`} x={c.x} y={h - 8} textAnchor="middle" fontSize="8" fill={hover === i ? "#544af7" : "#8d94a8"} fontWeight={hover === i ? "bold" : "normal"} fontFamily="Roboto, sans-serif" className="transition-all">
            {new Date(c.date).toLocaleDateString("en-US", { month: "short" })}
          </text>
        ))}
      </svg>
    </div>
  );
}
