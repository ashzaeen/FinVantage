import Link from "next/link";

const BENEFITS = [
  "Shows up on checkout, rental and car-financing pages",
  "Reads only the price, item type and merchant, nothing else on the page",
  "Suggests only. It never clicks, fills or buys anything for you",
];

function CheckLine({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0">
        <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.12)" />
        <path d="M8 12.5l2.5 2.5L16 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </li>
  );
}

/** A mock browser window: aria-hidden, since the real content is the paragraph and benefit list
 * beside it. The figures are clearly illustrative example values. */
function MockBrowser() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(255,255,255,0.12)", background: "#1A2234" }}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2.5" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        <span className="ml-2 rounded-md px-2 py-1 text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>shop.example.com/sofa</span>
      </div>
      <div className="relative p-4">
        <div className="h-24 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="mt-3 h-3 w-2/3 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="mt-2 h-3 w-1/3 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />

        <div className="absolute bottom-3 right-3 w-[180px] rounded-xl p-3 shadow-xl" style={{ background: "white" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--landing-text-muted)" }}>FinVantage Copilot</p>
          <p className="mt-1 text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-warning-text)" }}>71% → 64%</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--landing-text-secondary)" }}>About 3 months later</p>
          <p className="mt-2 rounded-lg px-2 py-1.5 text-[10px] leading-snug" style={{ background: "var(--landing-tint-50)", color: "var(--landing-primary-dark)" }}>
            Tip: Pay from checking, not your rewards card.
          </p>
        </div>
      </div>
    </div>
  );
}

export function CopilotSection() {
  return (
    <section id="copilot" className="scroll-mt-20 py-18 text-white md:py-24" style={{ background: "var(--landing-dark-bg)" }}>
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <span className="inline-flex min-h-8 items-center rounded-full px-3.5 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.1)", color: "white" }}>
            Chrome Extension
          </span>
          <h2 className="mt-5 max-w-[20ch] text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]" style={{ fontFamily: "var(--font-landing-heading)" }}>
            A Heads-Up, Right Where You Shop
          </h2>
          <p className="mt-4 max-w-[46ch] text-base leading-7" style={{ color: "rgba(255,255,255,0.75)" }}>
            The Copilot checks a purchase against your real goals the moment you're looking at it, not after it's already on your statement.
          </p>
          <ul className="mt-6 space-y-3">
            {BENEFITS.map((benefit) => <CheckLine key={benefit}>{benefit}</CheckLine>)}
          </ul>
          <Link
            href="/copilot"
            className="mt-7 flex min-h-11 w-fit items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ color: "var(--landing-dark-bg)" }}
          >
            Add to Chrome
          </Link>
        </div>
        <MockBrowser />
      </div>
    </section>
  );
}
