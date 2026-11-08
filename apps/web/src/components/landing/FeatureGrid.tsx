"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

/** A small frame every preview sits in: fixed height, so the grid stays aligned regardless of
 * what's inside. Previews are illustrative mockups built from the page's own tokens, not a
 * screenshot of a real account, and are marked aria-hidden since they add nothing a screen
 * reader needs beyond the card's own title and body text. */
function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-[166px] flex-col justify-center overflow-hidden rounded-2xl p-4 pt-7"
      style={{ background: "var(--landing-section-bg)", border: "1px solid var(--landing-border-subtle)" }}
    >
      <span className="absolute left-4 top-2 text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--landing-text-muted)" }}>Example Preview</span>
      {children}
    </div>
  );
}

function CopilotPreview() {
  return (
    <PreviewFrame>
      <div className="flex items-start gap-3">
        <div className="hidden w-24 shrink-0 rounded-lg bg-white p-2 sm:block" style={{ border: "1px solid var(--landing-border-subtle)" }}>
          <div className="h-10 rounded" style={{ background: "var(--landing-tint-100)" }} />
          <p className="mt-1.5 text-[9px] font-medium" style={{ color: "var(--landing-text-muted)" }}>Laptop</p>
          <p className="text-xs font-bold tabular-nums" style={{ color: "var(--landing-text)" }}>$2,499</p>
        </div>
        <div className="flex-1 rounded-xl bg-white p-2.5 shadow-sm" style={{ border: "1px solid #f3d19c", borderLeft: "3px solid #c47a20" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#a4620f" }}>Heads Up</p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug" style={{ color: "var(--landing-text)" }}>Your Japan trip moves 3 months later.</p>
          <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--landing-text-secondary)" }}>Move $800 from savings to keep it on track.</p>
        </div>
      </div>
    </PreviewFrame>
  );
}

function LifeEventsPreview() {
  const events = [{ left: "12%", label: "Today" }, { left: "54%", label: "New Baby" }, { left: "90%", label: "House" }];
  return (
    <PreviewFrame>
      <div className="relative h-10">
        <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2" style={{ background: "var(--landing-border)" }} />
        {events.map((event) => (
          <div key={event.label} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: event.left }}>
            <span className="mx-auto block h-3 w-3 rounded-full border-2 border-white" style={{ background: "var(--landing-primary)" }} />
            <span className="mt-1.5 block whitespace-nowrap text-[9px] font-medium" style={{ color: "var(--landing-text-muted)" }}>{event.label}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function AdvisorPreview() {
  return (
    <PreviewFrame>
      <div className="space-y-2">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md px-3 py-1.5 text-[11px] leading-snug" style={{ background: "white", border: "1px solid var(--landing-border-subtle)", color: "var(--landing-text)" }}>
          What should I cut to hit my house goal?
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md px-3 py-1.5 text-[11px] leading-snug text-white" style={{ background: "var(--landing-primary)" }}>
          Pausing dining out for 3 months gets you back on track.
        </div>
      </div>
    </PreviewFrame>
  );
}

function ReportsPreview() {
  const rows = [
    { label: "Spending", value: "−$120 vs. last month" },
    { label: "Savings Rate", value: "22%" },
    { label: "Goal Pace", value: "On track" },
  ];
  return (
    <PreviewFrame>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5" style={{ border: "1px solid var(--landing-border-subtle)" }}>
            <span className="text-[10px]" style={{ color: "var(--landing-text-secondary)" }}>{row.label}</span>
            <span className="text-[10px] font-semibold" style={{ color: "var(--landing-primary-dark)" }}>{row.value}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

const FEATURES = [
  {
    name: "Copilot Agent",
    preview: CopilotPreview,
    title: "Check a Purchase While You Shop",
    body: "A Chrome extension that tells you what a purchase does to your goals, right on the product page, before you buy.",
    points: ["Works on Amazon product pages", "A clear verdict: looks good, heads up, or warning", "Only the price and store ever leave your browser"],
    accent: "#544af7",
  },
  {
    name: "AI Advisor",
    preview: AdvisorPreview,
    title: "Ask Your AI Advisor",
    body: "Ask about your money in plain English and get answers grounded in your own accounts, transactions, and goals.",
    points: ["Uses your real balances and spending", "Shows charts and what-if scenarios", "Numbers are calculated first, then explained"],
    accent: "#16856d",
  },
  {
    name: "Life Events",
    preview: LifeEventsPreview,
    title: "Plan for Life Events",
    body: "Model a move, a new baby, or a job change before it happens, and see how each goal’s timeline shifts.",
    points: ["Describe the event in your own words", "You confirm before anything is saved", "Compare your goals with and without it"],
    accent: "#c47a20",
  },
  {
    name: "Quarterly Reports",
    preview: ReportsPreview,
    title: "Understand Your Quarter",
    body: "A plain-English recap of your spending, saving, and goal progress, written from your real numbers.",
    points: ["What changed since last quarter", "Savings rate and goal pace at a glance", "Regenerate a report any time"],
    accent: "#3769b1",
  },
];

const SLIDE_MS = 4500;
const MOVE = "600ms cubic-bezier(0.22, 1, 0.36, 1)";

/** The heading's feature name. It slides up in step with the cards below; the first name is
 * repeated at the end so the loop wraps forward instead of sliding back. */
function RotatingName({ index, animate }: { index: number; animate: boolean }) {
  return (
    <span className="relative inline-block h-[1.25em] overflow-hidden align-bottom">
      <span className="flex flex-col" style={{ transform: `translateY(-${index * 1.25}em)`, transition: animate ? `transform ${MOVE}` : "none" }}>
        {[...FEATURES, FEATURES[0]].map((feature, i) => (
          <span
            key={i}
            className="block h-[1.25em] whitespace-nowrap bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(90deg, var(--landing-primary), #16856d)" }}
          >
            {feature.name}
          </span>
        ))}
      </span>
    </span>
  );
}

export function FeatureGrid() {
  // 0..FEATURES.length; the last value is the copy of the first slide, reset without animation.
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const active = index % FEATURES.length;

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      setAnimate(true);
      setIndex((i) => Math.min(i + 1, FEATURES.length));
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused]);

  const wrapAround = () => {
    if (index === FEATURES.length) {
      setAnimate(false);
      setIndex(0);
    }
  };

  const goTo = (target: number) => {
    setAnimate(true);
    setIndex(target);
  };

  return (
    <section id="features" aria-roledescription="carousel" aria-label="Our Intelligent Features" className="scroll-mt-20 py-18 md:py-24" style={{ background: "var(--landing-section-bg)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--landing-border)" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--landing-primary-dark)" }}>Our Intelligent Features</p>
            <h2
              className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]"
              style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}
            >
              <span className="sr-only">Our intelligent features: {FEATURES.map((f) => f.name).join(", ")}</span>
              <span aria-hidden="true">Meet <RotatingName index={index} animate={animate} /></span>
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>Four AI-powered tools that read your real accounts and goals, and tell you what happens next.</p>
        </div>
        <div className="mt-8 overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <div className="flex" onTransitionEnd={(e) => e.target === e.currentTarget && wrapAround()} style={{ transform: `translateX(-${index * 100}%)`, transition: animate ? `transform ${MOVE}` : "none" }}>
            {[...FEATURES, FEATURES[0]].map((feature, slideIndex) => (
              <ul key={slideIndex} aria-hidden={slideIndex !== index} aria-label={feature.name} className="grid w-full shrink-0 gap-5 md:grid-cols-2">
                <li className="rounded-[24px] border-t-[3px] bg-white p-5 sm:p-6" style={{ borderTopColor: feature.accent, borderLeft: "1px solid var(--landing-border)", borderRight: "1px solid var(--landing-border)", borderBottom: "1px solid var(--landing-border)" }}>
                  <feature.preview />
                  <h3 className="mt-5 text-base font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>{feature.title}</h3>
                  <p className="mt-1.5 max-w-[56ch] text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>{feature.body}</p>
                </li>
                <li className="flex flex-col rounded-[24px] border-t-[3px] bg-white p-5 sm:p-6" style={{ borderTopColor: feature.accent, borderLeft: "1px solid var(--landing-border)", borderRight: "1px solid var(--landing-border)", borderBottom: "1px solid var(--landing-border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: feature.accent }}>{feature.name}</p>
                  <h3 className="mt-2 text-xl font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>What It Does for You</h3>
                  <ul className="mt-5 space-y-4">
                    {feature.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>
                        <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: feature.accent }}>✓</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </li>
              </ul>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="sr-only" aria-live="polite">Showing {FEATURES[active].name}</span>
          <div className="flex items-center gap-2">
            {FEATURES.map((feature, i) => (
              <button
                key={feature.name}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show ${feature.name}`}
                aria-current={i === active}
                className="h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"
                style={{ width: i === active ? 28 : 8, background: i === active ? feature.accent : "var(--landing-border)" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => goTo((active + FEATURES.length - 1) % FEATURES.length)} aria-label="Previous feature" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-white text-[#3730A3] transition-colors hover:bg-[#EEF2FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]" style={{ borderColor: "var(--landing-border)" }}>
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => goTo(active + 1)} aria-label="Next feature" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-white text-[#3730A3] transition-colors hover:bg-[#EEF2FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]" style={{ borderColor: "var(--landing-border)" }}>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
