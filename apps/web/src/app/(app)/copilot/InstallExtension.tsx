"use client";

import { useState } from "react";

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
    <section className="rounded-3xl border border-[#d4c8f7] bg-[#E9E0FF] p-5 text-[#302a76] shadow-[0_8px_24px_rgba(84,74,247,0.08)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-poppins text-base font-bold">Get the Copilot for Chrome</h2>
          <p className="mt-1 font-roboto text-sm text-[#5d5888]">Shows how a purchase affects your goals, right on the product page.</p>
        </div>
        <a
          href="/finvantage-copilot.zip"
          download
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center rounded-full bg-[#544af7] px-4 py-2 font-roboto text-sm font-semibold text-white transition-colors hover:bg-[#4338ca] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#544af7]"
        >
          Download extension
        </a>
      </div>
      {open ? (
        <>
          <ol className="mt-5 space-y-3 border-t border-[#d4c8f7] pt-5">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 font-roboto text-sm text-[#393464]">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-xs font-semibold text-[#544af7]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-2xl border border-[#e2dfff] bg-white/75 p-3 font-roboto text-xs leading-5 text-[#514c7d]">
            The Copilot uses whoever is signed in here. Link a bank on the Accounts page and its cards use that bank&apos;s
            balances; signed out, they use the demo profile. It only ever sends the price, the item type, and the store name.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 min-h-11 font-roboto text-sm text-[#514c7d] underline underline-offset-2 hover:text-[#302a76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"
          >
            Hide steps
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 min-h-11 font-roboto text-sm font-medium text-[#514c7d] underline underline-offset-2 hover:text-[#302a76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#544af7]"
        >
          How to install
        </button>
      )}
    </section>
  );
}
