"use client";

import {
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Lock,
  PiggyBank,
  Puzzle,
  RotateCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { formatUsd } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { BrandMark } from "@/components/ui/BrandMark";
import { CopilotCard } from "./copilot-parts";
import { ExampleTag } from "./layout-parts";
import { useCountTo, useInView, useStages } from "./motion";

/** The backdrop every use-case visual sits on. It is a surface, not a card. Windows inside stay under about 520px tall so a whole row fits a 720px laptop. */
function Stage({ children, forwardRef }: { children: ReactNode; forwardRef: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={forwardRef} className="lp-stage relative flex items-center justify-center overflow-hidden rounded-[28px] px-3 py-10 sm:rounded-[32px] sm:px-12 lg:min-h-[480px] lg:py-8">
      <div className="relative w-full max-w-[500px]">{children}</div>
    </div>
  );
}

/** A desktop app window: title bar with the Example tag, then the content. */
function AppWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-lp-line bg-white shadow-lp-float" role="group" aria-label={`Example: ${title}`}>
      <div className="flex h-10 items-center gap-2 border-b border-lp-line-soft bg-lp-bg px-3.5">
        <span className="flex w-10 gap-1 sm:w-14 sm:gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-lp-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-lp-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-lp-line" />
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-lp-muted">FinVantage · {title}</span>
        <span className="flex shrink-0 justify-end"><ExampleTag /></span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** A small card that overlaps the window's edge and pops in once. */
function Satellite({ on, className, children }: { on: boolean; className: string; children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      data-on={on}
      className={`lp-pop absolute z-10 rounded-2xl border border-lp-line bg-white px-3.5 py-3 shadow-lp-float ${className}`}
      style={{ transitionDuration: "700ms" } as CSSProperties}
    >
      {children}
    </div>
  );
}

function Meter({ label, value, percent, on, color, delay = 0 }: { label: string; value: string; percent: number; on: boolean; color: string; delay?: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium text-lp-text-2">{label}</span>
        <span className="shrink-0 tabular-nums text-lp-muted">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-lp-line-soft">
        <div className={`lp-fill h-full w-full rounded-full ${color}`} style={{ transform: `scaleX(${on ? percent / 100 : 0})`, transitionDelay: `${delay}ms` }} />
      </div>
    </div>
  );
}

type Pt = [number, number];
function smooth(pts: Pt[]): string {
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function band(upper: Pt[], lower: Pt[]): string {
  return `${smooth(upper)} ${smooth([...lower].reverse()).replace(/^M/, "L")} Z`;
}

/* ─── 1. Everything in one place ─────────────────────────────────────────── */

// Assets minus the loan: 8,420 + 26,300 + 142,900 - 14,600 = 163,020; assets alone are 177,620.
const NET_WORTH_CENTS = 16_302_000;
const TREND: Pt[] = [[40, 84], [112, 76], [184, 80], [256, 58], [328, 46], [388, 24]];
const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

export function DashboardPreview() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  const stage = useStages(seen, [150, 700, 250, 250, 250, 400]);
  const total = useCountTo(NET_WORTH_CENTS, stage >= 1, 1300);
  return (
    <Stage forwardRef={ref}>
      <AppWindow title="Overview">
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          <div className="min-w-0 rounded-xl bg-lp-tint-50 px-2.5 py-2.5 sm:px-3">
            <p className="text-[10px] font-medium text-lp-primary-dark">Net Worth</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold leading-tight tabular-nums text-lp-text sm:text-[17px]">{formatUsd(Math.round(total))}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-lp-bg px-2.5 py-2.5 sm:px-3">
            <p className="text-[10px] font-medium text-lp-muted">Assets</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold leading-tight tabular-nums text-lp-text sm:text-[17px]">$177,620</p>
          </div>
          <div className="min-w-0 rounded-xl bg-lp-bg px-2.5 py-2.5 sm:px-3">
            <p className="text-[10px] font-medium text-lp-muted">Debts</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold leading-tight tabular-nums text-loss sm:text-[17px]">−$14,600</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-lp-text">Net Worth, Last 6 Months</p>
          <p className="lp-fade flex items-center gap-1 text-[11px] font-semibold text-gain" data-on={stage >= 3}><ArrowUpRight size={12} aria-hidden="true" /> +$2,140</p>
        </div>
        <svg viewBox="0 0 420 118" className="mt-1 h-auto w-full" role="img" aria-label="Net worth rising steadily over the last six months">
          <defs>
            <linearGradient id="dash-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--landing-primary)" stopOpacity="0.2" />
              <stop offset="1" stopColor="var(--landing-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g stroke="var(--landing-border-subtle)" strokeWidth="1">{[20, 52, 84].map((y) => <line key={y} x1="30" x2="412" y1={y} y2={y} />)}</g>
          {[["$165k", 24], ["$155k", 56], ["$145k", 88]].map(([t, y]) => <text key={t} x="0" y={y} fontSize="9" fill="var(--landing-text-muted)">{t}</text>)}
          <path d={`${smooth(TREND)} L388,100 L40,100 Z`} fill="url(#dash-area)" className="lp-fade" data-on={stage >= 2} />
          <path d={smooth(TREND)} fill="none" stroke="var(--landing-primary)" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="lp-draw" data-on={stage >= 1} />
          <g className="lp-fade" data-on={stage >= 3}>
            <circle cx="388" cy="24" r="4.5" fill="#fff" stroke="var(--landing-primary)" strokeWidth="2.5" />
          </g>
          {MONTHS.map((m, i) => <text key={m} x={40 + i * 69.6} y="114" fontSize="9" textAnchor="middle" fill="var(--landing-text-muted)">{m}</text>)}
        </svg>

        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:pb-5">
          <ul className="space-y-2.5">
            {[
              { Icon: Wallet, name: "Checking", v: "$8,420" },
              { Icon: PiggyBank, name: "High-Yield Savings", v: "$26,300" },
              { Icon: TrendingUp, name: "Roth IRA", v: "$142,900" },
            ].map(({ Icon, name, v }, i) => (
              <li key={name} className="lp-pop flex items-center gap-2.5 text-xs" data-on={stage >= i + 3}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-lp-tint-50 text-lp-primary"><Icon size={14} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 truncate font-medium text-lp-text-2">{name}</span>
                <span className="font-semibold tabular-nums text-lp-text">{v}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-3">
            <Meter label="House" value="62%" percent={62} on={stage >= 5} color="bg-lp-primary" />
            <Meter label="Emergency Fund" value="81%" percent={81} on={stage >= 5} color="bg-gain" delay={120} />
            <Meter label="Japan Trip" value="34%" percent={34} on={stage >= 5} color="bg-series-3" delay={240} />
          </div>
        </div>
      </AppWindow>
      <Satellite on={stage >= 6} className="max-lg:hidden -right-10 -top-12">
        <p className="text-[11px] text-lp-muted">Cash Flow, November</p>
        <p className="mt-0.5 flex items-center gap-1 text-lg font-semibold tabular-nums text-flow-in"><ArrowUpRight size={16} aria-hidden="true" /> +$1,240</p>
      </Satellite>
      <Satellite on={stage >= 6} className="max-lg:hidden -bottom-5 -left-10">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-lp-text"><Landmark size={14} className="text-lp-primary" aria-hidden="true" /> 4 Accounts Linked</p>
        <p className="mt-0.5 text-[11px] text-lp-text-2">Updated a few minutes ago.</p>
      </Satellite>
    </Stage>
  );
}

/* ─── 2. Goals and simulation ────────────────────────────────────────────── */

const PLANS = [
  { label: "$400", k: 0.74, low: 0.52, high: 0.7, date: "Aug 2030", tone: "later" },
  { label: "$600", k: 1, low: 0.68, high: 0.82, date: "Feb 2030", tone: "on" },
  { label: "$800", k: 1.3, low: 0.84, high: 0.94, date: "Oct 2029", tone: "early" },
] as const;
const GROWTH = [0, 24, 50, 74, 94];
const SPREAD = [0, 14, 24, 32, 38];
const XS = [30, 140, 250, 360, 440];
const BASE = 116;

function fanPaths(k: number) {
  const mid = GROWTH.map((g) => BASE - g * 0.8 * k);
  const at = (arr: number[]): Pt[] => arr.map((y, i) => [XS[i]!, Math.max(6, y)] as Pt);
  return {
    median: at(mid),
    outerHi: at(mid.map((y, i) => y - SPREAD[i]! * 1.0 * k)),
    outerLo: at(mid.map((y, i) => y + SPREAD[i]! * 0.7)),
    innerHi: at(mid.map((y, i) => y - SPREAD[i]! * 0.5 * k)),
    innerLo: at(mid.map((y, i) => y + SPREAD[i]! * 0.35)),
  };
}

export function GoalsPreview() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  const [plan, setPlan] = useState(1);
  const [run, setRun] = useState(0);
  const stage = useStages(seen, [150, 700, 1500, 300], run);
  const p = PLANS[plan]!;
  const f = fanPaths(p.k);
  const pick = (i: number) => {
    setPlan(i);
    setRun((n) => n + 1);
  };
  return (
    <Stage forwardRef={ref}>
      <AppWindow title="Goals">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-lp-text">House Down Payment</p>
            <p className="mt-0.5 text-xs text-lp-text-2"><span className="font-semibold tabular-nums text-lp-text">$38,420</span> of $60,000 · target Feb 2030</p>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Monthly saving">
            <span className="text-[11px] text-lp-muted">Save a month</span>
            <div className="flex gap-0.5 rounded-full bg-lp-bg p-0.5">
              {PLANS.map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={i === plan}
                  className={`min-h-8 rounded-full px-3 text-xs font-semibold tabular-nums transition-colors ${i === plan ? "bg-lp-primary text-white shadow-sm" : "text-lp-text-2 hover:text-lp-primary-dark"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <svg viewBox="0 0 460 150" className="mt-3 h-auto w-full" role="img" aria-label="A fan chart of possible savings paths toward the $60,000 goal line.">
          <g stroke="var(--landing-border-subtle)" strokeWidth="1">{[30, 60, 90, BASE].map((y) => <line key={y} x1="30" x2="448" y1={y} y2={y} />)}</g>
          {[["$60k", 33], ["$40k", 63], ["$20k", 93], ["$0", 119]].map(([t, y]) => <text key={t} x="0" y={y} fontSize="9" fill="var(--landing-text-muted)">{t}</text>)}
          <path d={band(f.outerHi, f.outerLo)} fill="var(--fan-outer)" className="lp-fade" data-on={stage >= 2} />
          <path d={band(f.innerHi, f.innerLo)} fill="var(--fan-inner)" className="lp-fade" data-on={stage >= 2} />
          <path d={smooth(f.median)} fill="none" stroke="var(--fan-line)" strokeWidth="3" strokeLinecap="round" pathLength={1} className="lp-draw" data-on={stage >= 1} />
          <line x1="30" x2="448" y1="30" y2="30" stroke="var(--landing-text-muted)" strokeWidth="1.5" strokeDasharray="4 5" />
          {["2026", "2027", "2028", "2029", "2030"].map((year, i) => (
            <text key={year} x={XS[i]} y="144" fontSize="9" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fill="var(--landing-text-muted)">{year}</text>
          ))}
        </svg>

        <div className="lp-pop mt-2 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 sm:gap-3 lg:mb-4" data-on={stage >= 3}>
          <div className="rounded-xl bg-lp-bg px-3.5 py-2.5">
            <p className="text-[11px] text-lp-muted">Chance of reaching the goal</p>
            <div className="mt-0.5"><ProbabilityRange low={p.low} high={p.high} /></div>
          </div>
          <div className="rounded-xl bg-lp-bg px-3.5 py-2.5">
            <p className="text-[11px] text-lp-muted">Projected funding date</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${p.tone === "later" ? "text-lp-warn-text" : p.tone === "early" ? "text-gain" : "text-lp-text"}`}>{p.date}</p>
          </div>
        </div>
      </AppWindow>
      <Satellite on={stage >= 4} className="max-lg:hidden -bottom-5 -right-10">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-lp-text"><Target size={14} className="text-lp-primary" aria-hidden="true" /> One Shared Pool</p>
        <p className="mt-0.5 text-[11px] text-lp-text-2">The same savings also fund your Japan Trip.</p>
      </Satellite>
    </Stage>
  );
}

/* ─── 3. Advisor ─────────────────────────────────────────────────────────── */

const QA = [
  {
    chip: "Back on Track",
    question: "How do I get my house goal back on track?",
    intro: "Three ways, ranked by how fast they get you back:",
    check: "$150 × 6 months = $900",
    options: [
      { title: "Cut dining out by $150 a month", note: "Back on track in about 6 months", tag: "Best Fit", figure: "−$150/mo", bar: 90 },
      { title: "Add $90 a month from each paycheck", note: "Back on track in about 10 months", tag: "Gentler", figure: "+$90/mo", bar: 58 },
      { title: "Push the goal back 8 months", note: "No change to your spending", tag: "No Cuts", figure: "+8 mo", bar: 30 },
    ],
  },
  {
    chip: "A $2,800 Sofa",
    question: "Can I afford a $2,800 sofa?",
    intro: "Yes, with a trade-off. Here is what each choice costs your goals:",
    check: "$2,800 ÷ 2 = $1,400 a month",
    options: [
      { title: "Split it over two months", note: "House goal moves about 1 month", tag: "Best Fit", figure: "1 mo", bar: 90 },
      { title: "Wait one pay cycle", note: "Goal date stays Feb 2030", tag: "No Delay", figure: "0 mo", bar: 100 },
      { title: "Buy it today", note: "House goal moves about 3 months", tag: "Costliest", figure: "3 mo", bar: 40 },
    ],
  },
  {
    chip: "Pause Saving",
    question: "What happens if I pause saving for a month?",
    intro: "Pausing is cheap if you pick the right goal. Compare:",
    check: "$600 skipped × 1 month",
    options: [
      { title: "Pause the emergency fund only", note: "That goal slips about 1 month", tag: "Best Fit", figure: "1 mo", bar: 85 },
      { title: "Pause both goals", note: "Both goals slip about 1 month", tag: "Simplest", figure: "1 mo", bar: 70 },
      { title: "Pause only the house goal", note: "House goal moves about 2 months", tag: "Costliest", figure: "2 mo", bar: 45 },
    ],
  },
] as const;

export function AdvisorPreview() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  const [qa, setQa] = useState(0);
  const [run, setRun] = useState(0);
  const current = QA[qa]!;
  const stage = useStages(seen, [200, 1500, 350, 250, 250, 450], run);
  const typed = Math.round(useCountTo(current.question.length, stage >= 1, 1200));
  const pick = (i: number) => {
    setQa(i);
    setRun((n) => n + 1);
  };
  return (
    <Stage forwardRef={ref}>
      <AppWindow title="Advisor">
        <div className="flex items-center gap-2.5 border-b border-lp-line-soft pb-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lp-primary text-white"><Sparkles size={15} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-lp-text">Advisor</p>
            <p className="truncate text-[11px] text-lp-muted">Numbers are calculated first, then explained</p>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <p className="max-w-[88%] rounded-2xl rounded-br-md bg-lp-primary px-3.5 py-2 text-[13px] leading-5 text-white">
            {stage >= 1 ? current.question.slice(0, Math.max(typed, 1)) : " "}
          </p>
        </div>
        <div className="lp-pop mt-2.5 rounded-2xl rounded-bl-md bg-lp-bg px-3.5 py-3" data-on={stage >= 2}>
          <p className="text-[13px] leading-5 text-lp-text">{current.intro}</p>
          <ul className="mt-2 divide-y divide-lp-line">
            {current.options.map((o, i) => (
              <li key={`${qa}-${o.title}`} className="lp-pop py-2" data-on={stage >= i + 3}>
                <div className="flex items-start justify-between gap-3">
                  <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-semibold text-lp-text">
                    {o.title}
                    <span className="rounded-full bg-lp-tint-100 px-2 py-px text-[10px] font-semibold text-lp-primary-dark">{o.tag}</span>
                  </p>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-lp-primary-dark">{o.figure}</span>
                </div>
                <div className="mt-1 flex items-center gap-2.5">
                  <p className="min-w-0 flex-1 text-[11px] text-lp-text-2">{o.note}</p>
                  <div className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-lp-line sm:w-16">
                    <div className="lp-fill h-full w-full rounded-full bg-lp-primary" style={{ transform: `scaleX(${stage >= i + 3 ? o.bar / 100 : 0})` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="lp-fade mt-2 flex items-start gap-1.5 border-t border-lp-line pt-2 text-[11px] leading-4 text-lp-text-2" data-on={stage >= 6}>
            <ShieldCheck size={13} className="mt-px shrink-0 text-gain" aria-hidden="true" />
            <span><span className="font-semibold text-lp-text">Numbers checked:</span> <span className="tabular-nums">{current.check}</span>. Every figure matches an input.</span>
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Try another question">
          {QA.map((item, i) => (
            <button
              key={item.chip}
              type="button"
              onClick={() => pick(i)}
              aria-pressed={i === qa}
              className={`min-h-8 rounded-full border px-3 text-[11px] font-medium transition-colors ${i === qa ? "border-lp-primary bg-lp-tint-50 text-lp-primary-dark" : "border-lp-line bg-white text-lp-text-2 hover:border-lp-tint-200 hover:bg-lp-tint-50"}`}
            >
              {item.chip}
            </button>
          ))}
        </div>
        <div aria-hidden="true" className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-lp-line pl-3.5 pr-1 text-xs text-lp-muted">
          Ask about your money
          <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-lp-primary text-white"><Send size={13} /></span>
        </div>
      </AppWindow>
    </Stage>
  );
}

/* ─── 4. Spending and subscriptions ──────────────────────────────────────── */

const SPEND = [
  { name: "Groceries", cents: 62_000, color: "var(--series-1)" },
  { name: "Dining Out", cents: 34_000, color: "var(--series-2)" },
  { name: "Transport", cents: 18_000, color: "var(--series-3)" },
  { name: "Subscriptions", cents: 9_600, color: "var(--series-4)" },
] as const;
const SPEND_TOTAL = SPEND.reduce((s, c) => s + c.cents, 0);

export function SpendingPreview() {
  const { ref, seen } = useInView<HTMLDivElement>(0.3);
  const stage = useStages(seen, [150, 1100, 500, 900]);
  const total = useCountTo(SPEND_TOTAL, stage >= 1, 1100);
  let start = 0;
  return (
    <Stage forwardRef={ref}>
      <AppWindow title="Spending">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="relative h-[116px] w-[116px] shrink-0 sm:h-[132px] sm:w-[132px]">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="Spending split by category this month">
              <circle cx="60" cy="60" r="46" fill="none" stroke="var(--landing-border-subtle)" strokeWidth="14" />
              {SPEND.map((c, i) => {
                const pct = (c.cents / SPEND_TOTAL) * 100;
                const offset = -start;
                start += pct;
                const seg = Math.max(pct - 1.2, 0);
                return (
                  <circle
                    key={c.name}
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke={c.color}
                    strokeWidth="14"
                    pathLength={100}
                    className="lp-seg"
                    strokeDasharray={stage >= 1 ? `${seg} ${100 - seg}` : "0 100"}
                    strokeDashoffset={offset}
                    style={{ transitionDelay: `${i * 160}ms` }}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] text-lp-muted">This Month</span>
              <span className="text-[15px] font-semibold tabular-nums text-lp-text sm:text-base">{formatUsd(Math.round(total))}</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2.5">
            {SPEND.map((c, i) => (
              <li key={c.name} className="lp-pop flex items-center gap-2 text-xs" data-on={stage >= 1} style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-lp-text-2">{c.name}</span>
                <span className="font-semibold tabular-nums text-lp-text">{formatUsd(c.cents)}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 text-xs font-semibold text-lp-text">Budgets</p>
        <div className="mt-2.5 space-y-3 lg:pb-6">
          <Meter label="Groceries" value="$620 of $700" percent={89} on={stage >= 2} color="bg-lp-primary" />
          <Meter label="Dining Out" value="$340 of $400" percent={85} on={stage >= 2} color="bg-series-2" delay={120} />
          <Meter label="Transport" value="$180 of $250" percent={72} on={stage >= 2} color="bg-series-3" delay={240} />
        </div>
      </AppWindow>
      <Satellite on={stage >= 3} className="-top-8 right-0 w-[290px] max-w-[94%] sm:-top-10 sm:-right-6 lg:-right-8 lg:-top-12">
        <div className="flex items-start gap-2.5">
          <BrandMark size={28} />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-lp-text"><BellRing size={12} className="shrink-0 text-lp-warn-text" aria-hidden="true" /> StreamBox Raised Its Price</p>
            <p className="mt-0.5 text-[11px] leading-4 text-lp-text-2">Now $17.99 a month, up from $15.99.</p>
          </div>
        </div>
      </Satellite>
      <Satellite on={stage >= 4} className="max-lg:hidden -bottom-5 -left-10">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-lp-text"><PiggyBank size={14} className="text-gain" aria-hidden="true" /> If You Cancel It</p>
        <p className="mt-0.5 text-[11px] text-lp-text-2">$17.99 a month toward your House Goal.</p>
      </Satellite>
    </Stage>
  );
}

/* ─── 5. Copilot, in a row ───────────────────────────────────────────────── */

export function CopilotRowPreview() {
  const { ref, seen } = useInView<HTMLDivElement>(0.35);
  const stage = useStages(seen, [500, 800, 600]);
  return (
    <Stage forwardRef={ref}>
      <div aria-hidden="true" className="relative w-full overflow-hidden rounded-2xl border border-lp-line bg-white shadow-lp-float">
        <div className="flex h-11 items-center gap-2 border-b border-lp-line-soft bg-lp-bg px-3">
          <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-lp-line" /><span className="h-2.5 w-2.5 rounded-full bg-lp-line" /><span className="h-2.5 w-2.5 rounded-full bg-lp-line" /></span>
          <ChevronLeft size={15} className="ml-1 hidden text-lp-muted min-[400px]:block" />
          <ChevronRight size={15} className="hidden text-lp-line min-[400px]:block" />
          <RotateCw size={13} className="hidden text-lp-muted min-[400px]:block" />
          <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white px-3 text-[11px] text-lp-muted"><Lock size={10} className="shrink-0" /> <span className="truncate">shop.example.com/laptop-16</span></span>
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-lp-muted"><Puzzle size={14} />
            <span className="lp-pop absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-lp-primary" data-on={stage >= 1} />
          </span>
        </div>
        <div className="flex h-9 items-center gap-3 bg-lp-dark px-4">
          <span className="text-xs font-semibold text-white">shop</span>
          <span className="flex h-6 flex-1 items-center gap-1.5 rounded-md bg-white/15 px-2 text-[10px] text-white/70"><Search size={10} /> Search laptops</span>
          <ShoppingCart size={14} className="text-white/80" />
        </div>
        <div className="grid grid-cols-[0.9fr_1.1fr] gap-4 p-4 pb-52 sm:gap-5 sm:p-5 sm:pb-44">
          <div className="min-w-0">
            <div className="aspect-[4/3] rounded-xl bg-gradient-to-br from-lp-tint-100 via-lp-bg to-lp-tint-50" />
            <div className="mt-2 grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map((n) => <div key={n} className="aspect-square rounded-md bg-lp-bg" />)}</div>
          </div>
          <div className="min-w-0">
            <div className="h-3 w-11/12 rounded bg-lp-line" />
            <div className="mt-1.5 h-3 w-2/3 rounded bg-lp-line-soft" />
            <div className="mt-2.5 flex items-center gap-0.5">{[0, 1, 2, 3, 4].map((s) => <Star key={s} size={11} className="fill-[#F5B63A] text-[#F5B63A]" />)}<span className="ml-1 text-[10px] text-lp-muted">2,184</span></div>
            <p className="mt-3 text-[24px] font-semibold leading-none tabular-nums text-lp-text sm:text-[26px]">$2,499</p>
            <p className="mt-1 text-[11px] text-gain">In stock · Free delivery</p>
            <div className="mt-3 flex gap-2">
              <div className="flex h-9 flex-1 items-center justify-center rounded-lg bg-[#F5B63A] text-[11px] font-semibold text-lp-text sm:text-xs">Add to Cart</div>
              <div className="hidden h-9 flex-1 items-center justify-center rounded-lg border border-lp-line text-xs font-semibold text-lp-text-2 min-[420px]:flex">Buy Now</div>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-pop absolute bottom-3 right-2 z-10 sm:-right-8 sm:bottom-6" data-on={stage >= 2} style={{ transitionDuration: "700ms" } as CSSProperties}>
        <CopilotCard verdict="heads-up" impact="Your Japan trip moves 3 months later." move="Move $800 from savings to keep it on track." compact />
      </div>
      <Satellite on={stage >= 3} className="max-lg:hidden -bottom-5 -left-10">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-lp-text"><CheckCircle2 size={14} className="text-gain" aria-hidden="true" /> Reads Only the Price</p>
        <p className="mt-0.5 text-[11px] text-lp-text-2">And the merchant. Nothing else.</p>
      </Satellite>
    </Stage>
  );
}
