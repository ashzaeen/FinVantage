import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/** `viewportFit: "cover"` lets pages draw under the iPhone notch and home bar; the shell pads
 *  itself with `env(safe-area-inset-*)`. Zoom stays enabled on purpose, for accessibility. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android Chrome: shrink the layout when the on-screen keyboard opens, so the Advisor's message
  // box stays above it. iOS Safari ignores this and scrolls the page instead.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: { default: "FinVantage", template: "%s | FinVantage" },
  description: "Know what a purchase does to your goals, before you buy.",
};

/** Shared by the landing page and the dashboard. The dashboard's sidebar lives in `(app)/layout.tsx`. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Roboto:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
