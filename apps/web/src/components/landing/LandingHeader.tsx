import Link from "next/link";
import { BrandMark } from "./BrandMark";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-[1200px] items-center justify-between gap-6 px-5 md:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-poppins text-xl font-semibold tracking-tight text-ink">FinVantage</span>
        </Link>
        <Link
          href="/login"
          className="flex h-10 items-center rounded-full border border-line px-5 text-sm font-medium text-ink transition-shadow hover:shadow-[var(--shadow-float)]"
        >
          Sign In
        </Link>
      </div>
    </header>
  );
}
