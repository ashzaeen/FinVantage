import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";

const NAV_LINKS = [
  { href: "#use-cases", label: "Use Cases" },
  { href: "#how", label: "How It Works" },
  { href: "#copilot", label: "Copilot" },
  { href: "#trust", label: "Security" },
];

/** A plain server component: the mobile menu is a native <details>/<summary> disclosure, so no
 * client JS is needed just to open and close it. */
export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-lp-line/70 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2.5">
          <BrandMark size={32} />
          <span className="text-lg font-semibold tracking-[-0.01em] text-lp-text">FinVantage</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="flex min-h-11 items-center text-sm font-medium text-lp-text-2 transition-colors hover:text-lp-primary">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className="flex min-h-11 items-center px-3 text-sm font-medium text-lp-text transition-colors hover:text-lp-primary">
            Sign In
          </Link>
          <Link href="/login?mode=signup" className="flex min-h-10 items-center rounded-lg bg-lp-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-lp-primary-hover">
            Get Started
          </Link>
        </div>

        {/* Mobile: a native disclosure, so the menu needs no client JS. */}
        <details className="group relative md:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg text-lp-text [&::-webkit-details-marker]:hidden" aria-label="Open menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </summary>
          <div className="absolute right-0 top-[calc(100%+8px)] w-60 rounded-2xl border border-lp-line bg-white p-2 shadow-lp-float">
            <nav aria-label="Primary">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-lp-text-2 hover:bg-lp-tint-50">
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-1 space-y-1 border-t border-lp-line-soft pt-2">
              <Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-lp-text hover:bg-lp-tint-50">Sign In</Link>
              <Link href="/login?mode=signup" className="flex min-h-11 items-center justify-center rounded-lg bg-lp-primary px-3 text-sm font-semibold text-white">Get Started</Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
