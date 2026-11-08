"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";

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
    <Card
      title="Get the Copilot for Chrome"
      subtitle="Shows how a purchase affects your goals, right on the product page."
      action={
        <a
          href="/finvantage-copilot.zip"
          download
          onClick={() => setOpen(true)}
          className="rounded-full bg-[#544af7] px-4 py-2 font-roboto text-sm font-semibold text-white hover:bg-[#4338ca] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#544af7]"
        >
          Download extension
        </a>
      }
    >
      {open ? (
        <>
          <ol className="space-y-2">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 font-roboto text-sm text-[#16192c]">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#eef1fc] text-xs font-semibold text-[#544af7]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-2xl bg-[#f8f9fd] border border-[#edf0f7] p-3 font-roboto text-xs text-[#4b5268]">
            The Copilot uses whoever is signed in here. Link a bank on the Accounts page and its cards use that bank&apos;s
            balances; signed out, they use the demo profile. It only ever sends the price, the item type, and the store name.
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 font-roboto text-sm text-[#8d94a8] underline underline-offset-2 hover:text-[#16192c]"
          >
            Hide steps
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-roboto text-sm text-[#544af7] underline underline-offset-2 hover:text-[#4338ca]"
        >
          How to install
        </button>
      )}
    </Card>
  );
}
