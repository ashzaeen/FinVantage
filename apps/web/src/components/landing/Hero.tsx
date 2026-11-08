import Link from "next/link";
import { ProductPreview } from "./ProductPreview";

function CheckLine({ children }: { children: string }) {
  return (
    <li className="flex items-center gap-2 text-sm" style={{ color: "var(--landing-text-secondary)" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="10" fill="var(--landing-tint-100)" />
        <path d="M8 12.5l2.5 2.5L16 9.5" stroke="var(--landing-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </li>
  );
}

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden" style={{ background: "var(--landing-section-bg)", minHeight: "calc(100svh - 4rem)" }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-80"
        style={{ maskImage: "linear-gradient(90deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.58) 38%, #000 72%)" }}
      >
        <svg className="h-full w-full" viewBox="0 0 920 560" preserveAspectRatio="none" fill="none">
          <defs>
            <pattern id="hero-finance-grid" width="72" height="56" patternUnits="userSpaceOnUse">
              <path d="M72 0H0V56" stroke="#8588a7" strokeOpacity=".2" strokeWidth="1" />
            </pattern>
            <linearGradient id="hero-stock-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#544af7" stopOpacity=".22" />
              <stop offset="1" stopColor="#544af7" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="920" height="560" fill="url(#hero-finance-grid)" />
          <path d="M12 448L110 405L210 424L310 330L410 354L510 276L610 298L710 202L810 226L920 92V530H12V448Z" fill="url(#hero-stock-area)" />
          <g fill="#544af7" fillOpacity=".2">
            <rect x="76" y="422" width="18" height="108" rx="3" />
            <rect x="174" y="380" width="18" height="150" rx="3" />
            <rect x="272" y="340" width="18" height="190" rx="3" />
            <rect x="370" y="355" width="18" height="175" rx="3" />
            <rect x="468" y="285" width="18" height="245" rx="3" />
            <rect x="566" y="300" width="18" height="230" rx="3" />
            <rect x="664" y="220" width="18" height="310" rx="3" />
            <rect x="762" y="235" width="18" height="295" rx="3" />
            <rect x="860" y="135" width="18" height="395" rx="3" />
          </g>
          <path d="M12 530H920" stroke="#8588a7" strokeOpacity=".24" strokeWidth="1.5" />
          <path d="M12 448L110 405L210 424L310 330L410 354L510 276L610 298L710 202L810 226L920 92" stroke="#4f46e5" strokeOpacity=".62" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="810" cy="226" r="7" fill="#fff" stroke="#544af7" strokeOpacity=".72" strokeWidth="2.5" />
          <circle cx="920" cy="92" r="8" fill="#fff" stroke="#16856d" strokeOpacity=".82" strokeWidth="3" />
        </svg>
      </div>
      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-10 px-6 py-18 md:py-24 lg:grid-cols-2 lg:items-center lg:gap-16" style={{ minHeight: "calc(100svh - 4rem)" }}>
        <div className="lg:py-6">
          <span
            className="inline-flex min-h-8 items-center rounded-full px-3.5 text-xs font-semibold"
            style={{ background: "var(--landing-tint-100)", color: "var(--landing-primary-dark)" }}
          >
            Goal-Aware Spending
          </span>
          <h1
            className="mt-5 max-w-[20ch] text-[32px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[40px]"
            style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}
          >
            Know what a purchase does to your goals, <span style={{ color: "var(--landing-primary)" }}>before you buy.</span>
          </h1>
          <p className="mt-5 max-w-[48ch] text-base leading-7" style={{ color: "var(--landing-text-secondary)" }}>
            FinVantage runs a real simulation of your goals before and after a purchase, so you see the effect in seconds, not after the statement arrives.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signup"
              className="flex min-h-12 items-center justify-center rounded-xl px-6 text-sm font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--landing-primary)]/25"
              style={{ background: "var(--landing-primary)" }}
            >
              Create Your Account
            </Link>
          </div>
          <ul className="mt-7 flex flex-col gap-2 sm:flex-row sm:gap-6">
            <CheckLine>Model decisions before you commit</CheckLine>
            <CheckLine>Read-only bank connections</CheckLine>
          </ul>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}
