import Link from "next/link";
import type { ReactNode } from "react";
import { Calculator, Lock, Shield, TrendingUp } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { ListingCard } from "./ListingCard";
import { PHOTOS } from "./photos";

const REPO_URL = "https://github.com/ashzaeen/FinVantage";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-5 md:px-10 ${className}`}>{children}</div>;
}

/** Opens the dashboard signed out, so the API client uses the demo profile. */
export function TryDemoLink() {
  return (
    <Link
      href="/app"
      className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-line bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:border-[var(--ink-light)]"
    >
      Try the Demo
    </Link>
  );
}

const FEATURES = [
  {
    photo: PHOTOS.dashboard,
    title: "Dashboard",
    body: "All your accounts, balances and goals in one place.",
  },
  {
    photo: PHOTOS.lifeEvents,
    title: "Life Events",
    body: "Add a baby, a move or a new job, and see what changes.",
  },
  {
    photo: PHOTOS.advisor,
    title: "Advisor",
    body: "Talk to your finances. Ask what to cut right now to get your house down payment back on track.",
  },
  {
    photo: PHOTOS.reports,
    title: "Monthly Reports",
    body: "A plain recap each month: what went well, what did not, and what to do next.",
  },
  {
    photo: PHOTOS.copilot,
    title: "Copilot",
    body: "A heads-up on big purchases, right where you shop.",
    badge: "Chrome Extension",
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-16 md:py-20">
      <Container>
        <h2 className="font-poppins text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[34px]">
          What FinVantage Does
        </h2>
        <ul className="mt-8 grid gap-x-5 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <ListingCard photo={feature.photo} title={feature.title} lines={[feature.body]} badge={feature.badge} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Each point is a real product rule (root AGENTS.md), not marketing copy: what the system
 * actually does and does not do, so the trust claim is one a judge or engineer can verify. */
const TRUST_POINTS = [
  {
    icon: Calculator,
    iconBg: "#eef1fc",
    iconColor: "#544af7",
    title: "Math First, Always",
    body: "Every figure you see is computed before any AI touches it. A guardrail checks each word the AI writes against those real numbers, and falls back to a plain template if it can't verify one.",
  },
  {
    icon: Shield,
    iconBg: "#fff5e6",
    iconColor: "#ff9900",
    title: "Suggests, Never Acts",
    body: "FinVantage never moves money, applies for credit, or clicks anything on your behalf. Every recommendation is yours to accept, change, or ignore.",
  },
  {
    icon: TrendingUp,
    iconBg: "#e6faf4",
    iconColor: "#00c48c",
    title: "Ranges, Not False Promises",
    body: "Your future is shown as a range of likely outcomes, with the uncertainty stated plainly next to it, never a single number dressed up as a guarantee.",
  },
  {
    icon: Lock,
    iconBg: "#ffecee",
    iconColor: "#ff4d6d",
    title: "Sandbox Data Only",
    body: "Connect through Plaid's sandbox, or use a synthetic demo profile. No production bank credentials ever touch this build.",
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="scroll-mt-20 border-t border-line bg-surface py-16 md:py-20">
      <Container>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Built to Be Trusted</p>
        <h2 className="mt-2 max-w-[32ch] font-poppins text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[34px]">
          A Financial Advisor Should Earn Your Trust, Not Ask for It
        </h2>
        <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map(({ icon: Icon, iconBg, iconColor, title, body }) => (
            <li key={title}>
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: iconBg, color: iconColor }}
                aria-hidden="true"
              >
                <Icon size={22} strokeWidth={2} />
              </span>
              <h3 className="mt-4 font-poppins text-base font-semibold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="bg-accent py-16 text-white md:py-20">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h2 className="max-w-[28ch] font-poppins text-[28px] font-semibold leading-tight tracking-tight md:text-[34px]">
          See What Your Next Decision Does to Your Goals
        </h2>
        <p className="max-w-[48ch] text-[15px] leading-6 text-white/80">
          No account needed to look around. Every number in the demo is a real simulation on a synthetic profile, not a mockup.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/app"
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-white px-6 text-[15px] font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Try the Demo
          </Link>
          <Link
            href="/#sign-in"
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-white/30 px-6 text-[15px] font-medium text-white transition-colors hover:border-white/60"
          >
            Create Your Account
          </Link>
        </div>
      </Container>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <span className="font-poppins text-lg font-semibold text-ink">FinVantage</span>
        </Link>
        <p className="text-muted">Educational projections, not financial advice.</p>
        <a href={REPO_URL} className="text-ink hover:underline">
          GitHub
        </a>
      </Container>
    </footer>
  );
}
