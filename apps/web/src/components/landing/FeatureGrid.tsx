"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

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

function DashboardPreview() {
  return (
    <PreviewFrame>
      <div className="grid grid-cols-2 gap-2">
        {[{ label: "Checking", value: "$4,210" }, { label: "Savings", value: "$12,480" }].map((tile) => (
          <div key={tile.label} className="rounded-lg bg-white p-2" style={{ border: "1px solid var(--landing-border-subtle)" }}>
            <p className="text-[9px] font-medium" style={{ color: "var(--landing-text-muted)" }}>{tile.label}</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: "var(--landing-text)" }}>{tile.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2.5">
        <p className="text-[9px] font-medium" style={{ color: "var(--landing-text-muted)" }}>House Down Payment</p>
        <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--landing-tint-100)" }}>
          <div className="h-1.5 rounded-full" style={{ width: "42%", background: "var(--landing-primary)" }} />
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
  { preview: DashboardPreview, title: "A Clear Financial Overview", body: "See your accounts, cash flow, and savings goals together, with recent changes in view.", accent: "#544af7" },
  { preview: LifeEventsPreview, title: "Plan for Life Events", body: "Model a move, a new baby, or a job change, then compare how each goal’s timeline shifts.", accent: "#c47a20" },
  { preview: AdvisorPreview, title: "Ask Your AI Advisor", body: "Explore options and trade-offs grounded in your transactions, accounts, and goals.", accent: "#16856d" },
  { preview: ReportsPreview, title: "Understand Your Reports", body: "Review spending, savings progress, and investments with a concise view of what changed.", accent: "#3769b1" },
];

export function FeatureGrid() {
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = [FEATURES.slice(0, 2), FEATURES.slice(2, 4)];

  return (
    <section id="features" aria-roledescription="carousel" aria-label="What FinVantage Does" className="scroll-mt-20 py-18 md:py-24" style={{ background: "var(--landing-section-bg)" }}>
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--landing-border)" }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--landing-primary-dark)" }}>Built Around Your Decisions</p>
            <h2
              className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]"
              style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}
            >
              What FinVantage Does
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>One connected picture of your money, with practical ways to understand what happens next.</p>
        </div>
        <div className="mt-8 overflow-hidden">
          <div className="flex transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
            {slides.map((slide, slideIndex) => <ul key={slideIndex} aria-hidden={slideIndex !== activeSlide} aria-label={`Feature cards ${slideIndex * 2 + 1} to ${slideIndex * 2 + slide.length}`} className="grid w-full shrink-0 gap-5 md:grid-cols-2">
              {slide.map((feature) => (
                <li key={feature.title} className="group rounded-[24px] border-t-[3px] bg-white p-5 transition-colors hover:bg-[#fdfdff] sm:p-6" style={{ borderTopColor: feature.accent, borderLeft: "1px solid var(--landing-border)", borderRight: "1px solid var(--landing-border)", borderBottom: "1px solid var(--landing-border)" }}>
                  <feature.preview />
                  <h3 className="mt-5 text-base font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>{feature.title}</h3>
                  <p className="mt-1.5 max-w-[56ch] text-sm leading-6" style={{ color: "var(--landing-text-secondary)" }}>{feature.body}</p>
                </li>
              ))}
            </ul>)}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-4">
          <span className="sr-only" aria-live="polite">Showing feature group {activeSlide + 1} of {slides.length}</span>
          <p className="text-sm tabular-nums" style={{ color: "var(--landing-text-muted)" }}>0{activeSlide + 1} / 0{slides.length}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setActiveSlide((slide) => Math.max(0, slide - 1))} disabled={activeSlide === 0} aria-label="Previous feature cards" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-white text-[#3730A3] transition-colors hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]" style={{ borderColor: "var(--landing-border)" }}>
              <ChevronLeft size={19} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setActiveSlide((slide) => Math.min(slides.length - 1, slide + 1))} disabled={activeSlide === slides.length - 1} aria-label="Next feature cards" className="flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-white text-[#3730A3] transition-colors hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]" style={{ borderColor: "var(--landing-border)" }}>
              <ChevronRight size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
