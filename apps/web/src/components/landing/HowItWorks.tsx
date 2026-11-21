"use client";

import { Section, SectionHeading } from "./layout-parts";
import { Reveal, useInView } from "./motion";

const STEPS = [
  { title: "Bring in Your Financial Data", body: "Connect a supported account, or add your balances and transactions by hand." },
  { title: "Set the Goals That Matter", body: "A trip, a house, an emergency fund. Goals share one pool of savings, the way real money works." },
  { title: "Test a Decision First", body: "See the effect on your goals before you buy, not after the statement arrives." },
] as const;

export function HowItWorks() {
  const { ref, seen } = useInView<HTMLOListElement>(0.3);
  return (
    <Section id="how" tone="tint">
      <Reveal>
        <SectionHeading align="center" title="From Your Accounts to a Clear Answer in Three Steps" />
      </Reveal>
      <ol ref={ref} className="mt-14 grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 md:mt-20">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-5 sm:block">
            <span
              className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lp-primary text-base font-semibold text-white shadow-lp-card"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            {i < STEPS.length - 1 && (
              <>
                {/* Vertical connector on phones, horizontal from sm up. Each draws in once, left to right. */}
                <span aria-hidden="true" className="absolute bottom-[-2.5rem] left-[21px] top-11 w-px bg-lp-tint-200 sm:hidden" />
                <span
                  aria-hidden="true"
                  className="lp-fill absolute left-14 right-[-2rem] top-[22px] hidden h-px bg-lp-tint-200 sm:block"
                  style={{ transform: `scaleX(${seen ? 1 : 0})`, transitionDelay: `${i * 450}ms`, transitionDuration: "900ms" }}
                />
              </>
            )}
            <div className="sm:mt-6">
              <h3 className="text-lg font-semibold leading-snug text-lp-text">{step.title}</h3>
              <p className="mt-2 max-w-[34ch] text-pretty text-[15px] leading-7 text-lp-text-2">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
