import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

/** A placeholder, not a real policy. TODO: replace with an actual privacy policy once one
 * exists; in particular, whether bank data is ever shared or sold is not decided anywhere in
 * this repo yet, so this page must not claim an answer either way until it is. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[680px] px-6 py-20">
      <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: "var(--landing-text)" }}>Privacy</h1>
      <p className="mt-4 text-base leading-7" style={{ color: "var(--landing-text-secondary)" }}>
        FinVantage is a hackathon build and does not yet have a published privacy policy. Everything you see in the demo runs on sandbox or synthetic data, not a real bank account.
      </p>
      <Link href="/" className="mt-6 inline-flex text-sm font-semibold" style={{ color: "var(--landing-primary)" }}>
        Back to FinVantage
      </Link>
    </main>
  );
}
