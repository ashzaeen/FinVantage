import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms" };

/** A placeholder, not real terms of service. TODO: replace once FinVantage has published terms;
 * pricing in particular isn't decided anywhere in this repo, so this page must not invent one. */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-[680px] px-6 py-20">
      <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--landing-text)" }}>Terms</h1>
      <p className="mt-4 text-base leading-7" style={{ color: "var(--landing-text-secondary)" }}>
        FinVantage is a hackathon build and does not yet have published terms of service or a pricing model. It is offered as-is for demonstration and educational purposes, with no financial advice or guarantee implied.
      </p>
      <Link href="/" className="mt-6 inline-flex text-sm font-semibold" style={{ color: "var(--landing-primary)" }}>
        Back to FinVantage
      </Link>
    </main>
  );
}
