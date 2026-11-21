import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Section } from "./layout-parts";
import { Reveal } from "./motion";

export function ClosingCta() {
  return (
    <Section tone="brand" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(700px_320px_at_85%_0%,rgba(255,255,255,0.16),transparent_70%)]" />
      <Reveal>
        <div className="mx-auto max-w-[44rem] text-center">
          <h2 className="text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[46px]">See What Your Next Purchase Really Costs</h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-pretty text-base leading-7 text-white/80 sm:text-lg sm:leading-8">
            Set your goals once, then check any decision against them in seconds.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup" className="lp-lift flex min-h-12 items-center justify-center rounded-xl bg-white px-7 text-sm font-semibold text-lp-primary-dark">
              Create Your Account
            </Link>
            <Link
              href="/app"
              className="group flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Try the Demo<span aria-hidden="true" className="-ml-1">*</span>
              <ArrowRight size={16} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/70"><span aria-hidden="true">* </span>Judges: please use the demo for a hassle-free experience.</p>
        </div>
      </Reveal>
    </Section>
  );
}
