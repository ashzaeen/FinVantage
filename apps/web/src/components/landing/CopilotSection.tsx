"use client";

import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BrowserFrame, CopilotCard, type Verdict } from "./copilot-parts";
import { ExampleTag, Section, SectionHeading } from "./layout-parts";
import { Reveal, useInView, useStages } from "./motion";

const SCENARIOS: readonly {
  tab: string;
  url: string;
  headline: string;
  price: string;
  verdict: Verdict;
  impact: string;
  tradeoff: string;
  move: string;
}[] = [
  {
    tab: "Rent",
    url: "rentals.example.com/2-bed",
    headline: "2 Bed, Downtown",
    price: "$2,350 / mo",
    verdict: "heads-up",
    impact: "Rent would take 41% of your income.",
    tradeoff: "Your savings rate drops from 22% to 14%.",
    move: "Look for $1,900 or less to keep both goals on pace.",
  },
  {
    tab: "Checkout",
    url: "shop.example.com/checkout",
    headline: "Laptop, 16 Inch",
    price: "$2,499",
    verdict: "heads-up",
    impact: "Your Japan trip moves 3 months later.",
    tradeoff: "Paying by rewards card adds interest on top.",
    move: "Pay from checking, not your rewards card.",
  },
  {
    tab: "Car Quote",
    url: "cars.example.com/quote",
    headline: "Compact SUV, 72 Months",
    price: "$412 / mo",
    verdict: "warning",
    impact: "A 72-month loan keeps this payment for six years.",
    tradeoff: "A longer term lowers the payment and raises the total cost.",
    move: "Ask for a 48-month quote and compare the totals.",
  },
];

const SENT = ["Page type", "Item type", "Price", "Merchant"] as const;
const KEPT = ["Page text", "Browsing history", "Screenshots"] as const;

export function CopilotSection() {
  const [active, setActive] = useState(0);
  const { ref, seen } = useInView<HTMLDivElement>(0.35);
  const stage = useStages(seen, [700], active);
  const s = SCENARIOS[active]!;

  return (
    <Section id="copilot" tone="dark" tight>
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal>
          <SectionHeading
            onDark
            title="A Heads-Up, Right Where You Shop"
            body="The Copilot checks a purchase against your real goals while you are looking at it, on rental, checkout and car-financing pages, not after it reaches your statement."
          />
          <div className="mt-9 rounded-2xl border border-lp-dark-line p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Lock size={15} aria-hidden="true" /> What Leaves Your Browser
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {SENT.map((item) => (
                <li key={item} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-lp-dark-text">Never sent: {KEPT.join(", ").toLowerCase()}. It suggests only, and it never clicks, fills in or buys anything for you.</p>
          </div>
          <Link
            href="/copilot"
            className="group mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-lp-dark transition-colors hover:bg-lp-tint-100"
          >
            Add to Chrome
            <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </Reveal>

        <Reveal delay={120}>
          <div ref={ref}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div role="tablist" aria-label="Copilot examples" className="flex gap-1 rounded-full bg-white/10 p-1">
                {SCENARIOS.map((sc, i) => (
                  <button
                    key={sc.tab}
                    id={`copilot-tab-${i}`}
                    role="tab"
                    type="button"
                    aria-selected={i === active}
                    aria-controls="copilot-panel"
                    onClick={() => setActive(i)}
                    className={`min-h-9 rounded-full px-3 text-xs font-semibold transition-colors sm:px-4 ${i === active ? "bg-white text-lp-dark" : "text-white/75 hover:text-white"}`}
                  >
                    {sc.tab}
                  </button>
                ))}
              </div>
              <ExampleTag onDark />
            </div>
            <div id="copilot-panel" role="tabpanel" aria-labelledby={`copilot-tab-${active}`} className="relative">
              <BrowserFrame url={s.url} dark>
                <div className="p-5 pb-36 sm:pb-28">
                  <div className="h-28 rounded-xl bg-white/[0.06] sm:h-36" />
                  <p className="mt-4 text-sm font-semibold text-white">{s.headline}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{s.price}</p>
                  <div className="mt-3 h-2.5 w-2/3 rounded bg-white/10" />
                </div>
              </BrowserFrame>
              <div className="lp-pop absolute -bottom-5 right-3 sm:-right-5" data-on={stage >= 1}>
                <CopilotCard verdict={s.verdict} impact={s.impact} tradeoff={s.tradeoff} move={s.move} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
