"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Info, XCircle } from "lucide-react";
import { formatUsd, type CardEvaluator as CardEvaluatorVisual } from "@finvantage/contracts";
import { MockedBadge } from "@/components/ui/MockedBadge";
import { Chips, Eyebrow, Slider, Ticker, useTween, useVisual, VisualCard } from "./shared";

const STATUS = {
  good: { icon: CheckCircle2, color: "text-good" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  critical: { icon: XCircle, color: "text-critical" },
  info: { icon: Info, color: "text-accent" },
} as const;

/** The card itself, in the sidebar's purple, with a sheen that follows the pointer. */
function CardArt({ name, rewardsPercent }: { name: string; rewardsPercent: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [glow, setGlow] = useState({ x: 70, y: 20 });
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setGlow({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
      }}
      className="relative aspect-[1.586] w-full max-w-[300px] overflow-hidden rounded-2xl p-4 text-white shadow-[0_18px_40px_-12px_rgba(84,74,247,0.55)] transition-transform duration-300 hover:-translate-y-0.5"
      style={{
        background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, rgba(255,255,255,0.28), transparent 45%), linear-gradient(135deg, var(--sidebar-bg) 0%, var(--sidebar-bg-dark) 100%)`,
      }}
      aria-hidden
    >
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/5" />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="h-7 w-9 rounded-md bg-gradient-to-br from-white/80 to-white/30 shadow-inner" />
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold tabular-nums backdrop-blur">{rewardsPercent}% back</span>
        </div>
        <div>
          <p className="font-mono text-sm tracking-[0.2em] text-white/70">•••• •••• •••• ••••</p>
          <p className="mt-1 font-poppins text-base font-semibold leading-tight">{name}</p>
        </div>
      </div>
    </div>
  );
}

function ValueBar({ label, cents, max, tone, note }: { label: string; cents: number; max: number; tone: "good" | "muted" | "critical"; note?: string }) {
  const [width] = useTween([max > 0 ? cents / max : 0]);
  const color = tone === "good" ? "var(--good)" : tone === "critical" ? "var(--critical)" : "var(--ink-light)";
  return (
    <div className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3 text-xs">
      <span className="text-muted">{label}</span>
      <span className="h-2.5 rounded-r-[4px] bg-inset">
        <span className="block h-2.5 rounded-r-[4px]" style={{ width: `${Math.min(100, (width ?? 0) * 100)}%`, background: color }} />
      </span>
      <span className="text-right tabular-nums text-ink">
        {tone === "good" ? "+" : cents > 0 ? "−" : ""}{formatUsd(cents)}
        {note && <span className="block text-[10px] text-muted">{note}</span>}
      </span>
    </div>
  );
}

export function CardEvaluator({ initial }: { initial: CardEvaluatorVisual }) {
  const { visual: v, update, pending, failed } = useVisual(initial);
  const { inputs, figures } = v;
  const max = Math.max(1, figures.annualRewardsCents, figures.annualFeeCents, figures.annualInterestCents);
  const positive = figures.netCents >= 0;
  const spendMax = Math.max(300_000, Math.ceil((initial.defaultMonthlySpendCents * 3) / 10_000) * 10_000);

  return (
    <VisualCard pending={pending} failed={failed} label={`${inputs.cardName} evaluation`}>
      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,300px)_1fr]">
        <CardArt name={inputs.cardName} rewardsPercent={inputs.rewardsPercent} />
        <div>
          <Chips
            label="How you'd use it"
            options={["full", "carry"] as const}
            value={inputs.paysInFull ? "full" : "carry"}
            onChange={(o) => update({ ...inputs, paysInFull: o === "full" })}
            render={(o) => (o === "full" ? "I Pay in Full" : "I Carry a Balance")}
          />
          <p className={`mt-3 font-poppins text-4xl font-semibold tracking-tight ${positive ? "text-ink" : "text-critical"}`}>
            {positive ? "+" : "−"}
            <Ticker value={Math.abs(figures.netCents)} format={formatUsd} />
            <span className="ml-1 text-base font-normal text-muted">/year for you</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            on {formatUsd(v.monthlySpendCents)} a month of card spending · {inputs.annualFeeCents === 0 ? "no annual fee" : `${formatUsd(inputs.annualFeeCents)} fee`} · {inputs.aprPercent}% APR
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-y border-line py-3">
        <ValueBar label="Rewards" cents={figures.annualRewardsCents} max={max} tone="good" />
        <ValueBar label="Annual fee" cents={figures.annualFeeCents} max={max} tone="muted" />
        <ValueBar
          label="Interest"
          cents={figures.annualInterestCents}
          max={max}
          tone="critical"
          note={inputs.paysInFull ? "paid in full" : `on ${formatUsd(v.carriedBalanceCents)}`}
        />
      </div>

      <div className="mt-3">
        <Slider
          label="Monthly spending on this card"
          value={v.monthlySpendCents}
          min={0}
          max={spendMax}
          step={5_000}
          display={formatUsd(v.monthlySpendCents)}
          onChange={(monthlySpendCents) => update({ ...inputs, monthlySpendCents })}
        />
        <p className="mt-1 text-[11px] text-muted">
          {v.spendBasis === "cards"
            ? `You spend about ${formatUsd(v.defaultMonthlySpendCents)} a month on your cards now.`
            : `Your cards show no recent purchases, so this starts at your everyday spending: about ${formatUsd(v.defaultMonthlySpendCents)} a month.`}
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {v.checks.map((c) => {
          const { icon: Icon, color } = STATUS[c.status];
          return (
            <li key={c.label} className="flex gap-2.5 rounded-xl bg-inset px-3 py-2">
              <Icon size={16} className={`mt-0.5 shrink-0 ${color}`} aria-hidden />
              <span className="text-xs">
                <span className="font-semibold text-ink">{c.label}</span>
                <span className="block text-[var(--ink-secondary)]">{c.detail}</span>
              </span>
            </li>
          );
        })}
        {v.creditScore && (
          <li className="flex flex-wrap items-center gap-2.5 rounded-xl bg-inset px-3 py-2 text-xs">
            <Info size={16} className="shrink-0 text-accent" aria-hidden />
            <span className="font-semibold text-ink">Credit Score {v.creditScore.score}</span>
            <MockedBadge />
            <span className="w-full pl-6 text-[var(--ink-secondary)]">Approval is up to the issuer. A real score would come from your credit report.</span>
          </li>
        )}
      </ul>

      {(inputs.sources ?? []).length > 0 && (
        <div className="mt-3">
          <Eyebrow>Terms from the web. Confirm them with the issuer.</Eyebrow>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {(inputs.sources ?? []).map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                {s.title} <ExternalLink size={11} aria-hidden />
              </a>
            ))}
          </div>
        </div>
      )}
    </VisualCard>
  );
}
