import { Inter, Poppins } from "next/font/google";
import type { ReactNode } from "react";

/** Scoped to this route group only: the dashboard keeps Poppins + Roboto loaded via
 * the root layout's <link> tag. next/font self-hosts these, so no render-blocking Google
 * Fonts request on the landing page specifically. */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-landing-heading",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-landing-body",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${poppins.variable} ${inter.variable}`} style={{ fontFamily: "var(--font-landing-body)" }}>
      {children}
    </div>
  );
}
