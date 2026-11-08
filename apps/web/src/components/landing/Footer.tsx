import Link from "next/link";
import { BrandMark } from "./BrandMark";

const REPO_URL = "https://github.com/ashzaeen/FinVantage";

export function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--landing-border)" }}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <BrandMark size={28} />
          <span className="text-base font-semibold" style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}>FinVantage</span>
        </Link>
        <p style={{ color: "var(--landing-text-muted)" }}>Educational projections, not financial advice.</p>
        <nav aria-label="Legal" className="flex items-center gap-5">
          <Link href="/privacy" className="flex min-h-11 items-center hover:underline" style={{ color: "var(--landing-text)" }}>Privacy</Link>
          <Link href="/terms" className="flex min-h-11 items-center hover:underline" style={{ color: "var(--landing-text)" }}>Terms</Link>
          <a href={REPO_URL} className="flex min-h-11 items-center hover:underline" style={{ color: "var(--landing-text)" }}>GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
