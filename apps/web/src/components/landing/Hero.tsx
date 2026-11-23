import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeroSimulation } from "./HeroSimulation";

export function Hero() {
  return (
    <section className="lp-hero-bg relative isolate overflow-hidden">
      <div aria-hidden="true" className="lp-hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-14 px-6 pb-20 pt-14 md:pb-28 md:pt-20 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-16">
        <div>
          <h1 className="lp-rise text-balance text-[clamp(2rem,3.7vw,3.125rem)] font-semibold leading-[1.1] tracking-[-0.03em] text-lp-text">
            Know what a purchase does to your goals, <span className="text-lp-ink">before you buy.</span>
          </h1>
          <p className="lp-rise mt-6 max-w-[46ch] text-pretty text-lg leading-8 text-lp-text-2" style={{ "--d": "90ms" } as React.CSSProperties}>
            FinVantage runs a real simulation of your goals before and after a purchase, so you see the effect in seconds, not when the statement arrives.
          </p>
          <div className="lp-rise mt-9 flex flex-wrap items-center gap-3" style={{ "--d": "180ms" } as React.CSSProperties}>
            <Link
              href="/login?mode=signup"
              className="lp-lift flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-primary px-7 sm:w-auto text-sm font-semibold text-white shadow-lp-card transition-colors hover:bg-lp-primary-hover"
            >
              Create Your Account
            </Link>
            {/* Signed out, the dashboard runs on the shared demo profile, so anyone can look around without signing up. */}
            <Link
              href="/app"
              className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-lp-line bg-lp-surface px-6 sm:w-auto text-sm font-semibold text-lp-primary-dark transition-colors hover:border-lp-tint-200 hover:bg-lp-tint-50"
            >
              Try the Demo<span aria-hidden="true" className="-ml-1 text-lp-ink">*</span>
              <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <p className="lp-rise mt-5 text-sm text-lp-muted" style={{ "--d": "260ms" } as React.CSSProperties}>
            The demo runs on sample data. No bank connection needed.
            <span className="mt-1 block text-xs"><span aria-hidden="true">* </span>Judges: please use the demo for a hassle-free experience.</span>
          </p>
        </div>

        <HeroSimulation />
      </div>
    </section>
  );
}
