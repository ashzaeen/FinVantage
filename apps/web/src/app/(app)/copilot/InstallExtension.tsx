"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";

/*
 * The extension isn't on the Chrome Web Store, so it installs as an unpacked extension. The zip is
 * built from the current code on every dashboard build (scripts/bundle-extension.mjs) and points
 * at this dashboard's API, so it follows whoever is signed in here.
 */
const STEPS = [
  "Download the extension and unzip it. You'll get a folder called finvantage-copilot.",
  "In Chrome, go to chrome://extensions and turn on Developer mode (top right).",
  "Click Load unpacked and choose the finvantage-copilot folder.",
  "Pin it from the puzzle-piece menu, then open any product on Amazon.",
];

export function InstallExtension() {
  // Collapsed until someone downloads it, so the activity feed gets the space.
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl border border-[color:var(--border-accent)] bg-accent-soft p-5 text-ink [box-shadow:var(--shadow-lift)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-poppins text-base font-bold">Get the Copilot for Chrome</h2>
          <p className="mt-1 font-roboto text-sm text-ink-secondary">Shows how a purchase affects your goals, right on the product page.</p>
        </div>
        <a
          href="/finvantage-copilot.zip"
          download
          onClick={() => setOpen(true)}
          className={buttonClass()}
        >
          Download extension
        </a>
      </div>
      {open ? (
        <>
          <ol className="mt-5 space-y-3 border-t border-[color:var(--border-accent)] pt-5">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 font-roboto text-sm text-ink">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-raised text-xs font-semibold text-accent-ink">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-2xl border border-line bg-raised/75 p-3 font-roboto text-xs leading-5 text-ink-secondary">
            The Copilot uses whoever is signed in here. Link a bank on the Accounts page and its cards use that bank&apos;s
            balances; signed out, they use the demo profile. It only ever sends the price, the item type, and the store name.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 min-h-11 font-roboto text-sm text-ink-secondary underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
          >
            Hide steps
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 min-h-11 font-roboto text-sm font-medium text-ink-secondary underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink"
        >
          How to Install
        </button>
      )}
    </section>
  );
}
