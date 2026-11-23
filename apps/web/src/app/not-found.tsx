import Link from "next/link";
import { BrandMark } from "@/components/ui/BrandMark";

/** Any address that is not a page. Plain and on the brand, with one way back. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-6 py-16">
      <BrandMark size={44} />
      <h1 className="font-poppins text-3xl font-bold tracking-tight text-ink">Page Not Found</h1>
      <p className="text-base leading-7 text-ink-secondary">
        That page does not exist, or it moved. Your accounts and goals are where you left them.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-[color:var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          Go to Overview
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-ink hover:underline">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
