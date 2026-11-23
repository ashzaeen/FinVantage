"use client";

// theme-ok-file: the card face is artwork, the same in both themes.

import { useState } from "react";
import { formatUsd, formatPercent, type Account } from "@finvantage/contracts";

const CARD_GRADIENTS = [
  "linear-gradient(135deg, #37337c 0%, #4c46b4 45%, #6a60ea 100%)",
  "linear-gradient(135deg, #2d83c9 0%, #3e68e4 55%, #544af7 100%)",
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #0e5f58 0%, #1d8a7e 55%, #2a9d8f 100%)",
];

export function VisualCard({ account, index }: { account: Account; index: number }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const mask = account.mask ?? "••••";
  const number = `•••• •••• •••• ${mask}`;
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const balance = account.balanceCents;
  const limit = account.creditLimitCents ?? 0;
  const utilPct = limit > 0 ? Math.round((balance / limit) * 100) : 0;

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -8, y: x * 8 });
  }

  function handleLeave() {
    setTilt({ x: 0, y: 0 });
    setHovering(false);
  }

  return (
    <div
      className="relative cursor-pointer"
      style={{ perspective: "600px" }}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={handleLeave}
      onClick={() => setFlipped((f) => !f)}
    >
      <div
        className="relative transition-transform duration-300 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped
            ? "rotateY(180deg)"
            : `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${hovering ? "scale(1.02)" : "scale(1)"}`,
        }}
      >
        {/* Front */}
        <div
          className="relative overflow-hidden rounded-3xl p-5 text-white"
          style={{ background: gradient, minHeight: 236, backfaceVisibility: "hidden", visibility: flipped ? "hidden" : "visible", transition: "visibility 0s linear 0.15s" }}
        >
          {/* Shine effect on hover */}
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle at ${(tilt.y / 8 + 0.5) * 100}% ${(tilt.x / -8 + 0.5) * 100}%, rgba(255,255,255,0.15) 0%, transparent 60%)`,
              opacity: hovering ? 1 : 0,
            }}
          />
          <div className="pointer-events-none absolute -bottom-10 -right-8 h-44 w-44 rounded-full bg-white/10 blur-xl" />

          <div className="flex items-center justify-between">
            <span className="font-roboto text-xs font-medium text-white/90">{account.institution}</span>
            <div className="flex items-center -space-x-2">
              <span className="h-5 w-5 rounded-full bg-[#eb001b]" />
              <span className="h-5 w-5 rounded-full bg-[#f79e1b] opacity-90" />
            </div>
          </div>

          <p className="mt-5 font-poppins text-sm font-semibold tracking-widest text-white drop-shadow-sm">{number}</p>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="font-roboto text-xs uppercase tracking-wider text-white/60">Balance</p>
              <p className="font-poppins text-lg font-bold tabular-nums">{formatUsd(balance)}</p>
            </div>
            {limit > 0 && (
              <div className="text-right">
                <p className="font-roboto text-xs uppercase tracking-wider text-white/60">Utilization</p>
                <p className="font-poppins text-sm font-bold tabular-nums">{utilPct}%</p>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between font-roboto text-xs text-white/80">
            <span>{account.name}</span>
            {account.annualRate != null && <span>{formatPercent(account.annualRate)} APR</span>}
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 overflow-hidden rounded-3xl p-5 text-white"
          style={{
            background: gradient,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            // backface-visibility alone leaves the mirrored back showing when an ancestor flattens 3D,
            // so each face is also hidden outright while it is the one facing away.
            visibility: flipped ? "visible" : "hidden",
            transition: "visibility 0s linear 0.15s",
          }}
        >
          <div className="pointer-events-none absolute -bottom-10 -right-8 h-44 w-44 rounded-full bg-white/10 blur-xl" />

          <p className="font-roboto text-xs font-medium text-white/70">Card Details</p>

          <div className="mt-3 space-y-2.5">
            {limit > 0 && (
              <div className="flex justify-between">
                <span className="font-roboto text-xs text-white/60">Available Credit</span>
                <span className="font-poppins text-sm font-bold tabular-nums">{formatUsd(limit - balance)}</span>
              </div>
            )}
            {limit > 0 && (
              <div className="flex justify-between">
                <span className="font-roboto text-xs text-white/60">Credit Limit</span>
                <span className="font-poppins text-sm font-bold tabular-nums">{formatUsd(limit)}</span>
              </div>
            )}
            {account.minimumPaymentCents != null && (
              <div className="flex justify-between">
                <span className="font-roboto text-xs text-white/60">Min. Payment</span>
                <span className="font-poppins text-sm font-bold tabular-nums">{formatUsd(account.minimumPaymentCents)}</span>
              </div>
            )}
            {account.nextPaymentDueOn && (
              <div className="flex justify-between">
                <span className="font-roboto text-xs text-white/60">Due Date</span>
                <span className="font-poppins text-sm font-bold">{new Date(account.nextPaymentDueOn).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
            )}
            {account.promoRateEndsOn && (
              <div className="flex justify-between">
                <span className="font-roboto text-xs text-white/60">0% Promo Until</span>
                <span className="font-poppins text-sm font-bold">{new Date(account.promoRateEndsOn).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
              </div>
            )}
          </div>

          <p className="mt-3 text-center font-roboto text-xs text-white/60">Click to flip back</p>
        </div>
      </div>
    </div>
  );
}
