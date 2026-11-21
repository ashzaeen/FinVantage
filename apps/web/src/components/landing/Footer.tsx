import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";

const REPO_URL = "https://github.com/ashzaeen/FinVantage";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "#use-cases", label: "Use Cases" },
      { href: "#how", label: "How It Works" },
      { href: "/copilot", label: "Copilot Extension" },
    ],
  },
  {
    heading: "Get Started",
    links: [
      { href: "/login?mode=signup", label: "Create Your Account" },
      { href: "/login", label: "Sign In" },
      { href: "/app", label: "Try the Demo" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "#trust", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: REPO_URL, label: "GitHub" },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-lp-line bg-white">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-6 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/" className="flex min-h-11 w-fit items-center gap-2.5">
            <BrandMark size={28} />
            <span className="text-base font-semibold text-lp-text">FinVantage</span>
          </Link>
          <p className="mt-3 max-w-[30ch] text-sm leading-6 text-lp-text-2">Know what a purchase does to your goals, before you buy.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <p className="text-sm font-semibold text-lp-text">{col.heading}</p>
            <ul className="mt-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="flex min-h-11 items-center text-sm text-lp-text-2 transition-colors hover:text-lp-primary">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-lp-line-soft">
        <p className="mx-auto max-w-[1200px] px-6 py-5 text-xs text-lp-muted">Educational projections, not financial advice. Portfolio and credit score values are mocked, and this build uses sandbox data.</p>
      </div>
    </footer>
  );
}
