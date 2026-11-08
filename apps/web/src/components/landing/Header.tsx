import Link from "next/link";
import { BrandMark } from "./BrandMark";

const NAV_LINKS = [
  { href: "#how", label: "How It Works" },
  { href: "#features", label: "Features" },
  { href: "#copilot", label: "Copilot" },
  { href: "#trust", label: "Security" },
];

/** A plain server component: the mobile menu is a native <details>/<summary> disclosure, so no
 * client JS is needed just to open and close it. */
export function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ borderColor: "var(--landing-border)", background: "rgba(255, 255, 255, 0.85)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <BrandMark size={32} />
          <span
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-landing-heading)", color: "var(--landing-text)" }}
          >
            FinVantage
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex min-h-11 items-center text-sm font-medium transition-colors hover:text-[var(--landing-primary)]"
              style={{ color: "var(--landing-text-secondary)" }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="flex min-h-11 items-center px-3 text-sm font-medium transition-colors hover:text-[var(--landing-primary)]"
            style={{ color: "var(--landing-text)" }}
          >
            Sign In
          </Link>
        </div>

        {/* Mobile: a native disclosure, so the menu needs no client JS. */}
        <details className="group relative md:hidden">
          <summary
            className="flex h-11 w-11 list-none items-center justify-center rounded-lg [&::-webkit-details-marker]:hidden"
            style={{ color: "var(--landing-text)" }}
            aria-label="Open menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </summary>
          <div
            className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-2xl border bg-white p-2 shadow-lg"
            style={{ borderColor: "var(--landing-border)" }}
          >
            <nav aria-label="Primary">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium"
                  style={{ color: "var(--landing-text-secondary)" }}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-1 border-t pt-2" style={{ borderColor: "var(--landing-border-subtle)" }}>
              <Link
                href="/login"
                className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium"
                style={{ color: "var(--landing-text)" }}
              >
                Sign In
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
