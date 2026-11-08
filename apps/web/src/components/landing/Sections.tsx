import Link from "next/link";
import type { ReactNode } from "react";
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
