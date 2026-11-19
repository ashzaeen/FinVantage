import type { BillingChannel, CancellationGuide } from "@finvantage/contracts";

/*
 * How to cancel a subscription, for the user to follow themselves. FinVantage cancels nothing.
 *
 * This is a small hand-written sample, not a maintained dataset. The steps and links were written
 * from general knowledge and have NOT been checked against the providers' live sites, so every
 * entry has `lastChecked: null` and the page says so. Providers change their pages: whoever checks
 * an entry should set its date. A link is https only, and is null when no stable one is known.
 * The merchants StreamFlix, Showreel, Tunewave, Daily Ledger News, Peak Fitness and Skyvault
 * Storage are the fictional ones in the demo profile.
 */

export interface CancellationEntry {
  /** Normalized merchant names, as `normalizeMerchant` in math-core writes them. Whole words only. */
  names: readonly string[];
  title: string;
  url: string | null;
  steps: readonly string[];
  /** When someone last confirmed the steps and link, or null if no one has. */
  lastChecked: string | null;
}

export const CANCELLATION_CATALOG: readonly CancellationEntry[] = [
  {
    names: ["netflix"],
    title: "Cancel Netflix",
    url: "https://www.netflix.com/cancelplan",
    steps: ["Sign in to Netflix on the web.", "Open Account, then choose Cancel Membership.", "Confirm, and keep the email Netflix sends."],
    lastChecked: null,
  },
  {
    names: ["spotify"],
    title: "Cancel Spotify",
    url: "https://www.spotify.com/account/subscription/",
    steps: ["Sign in at spotify.com, not in the app.", "Open Account, then Manage your plan, and choose to cancel.", "Confirm, and keep the email Spotify sends."],
    lastChecked: null,
  },
  {
    names: ["hulu"],
    title: "Cancel Hulu",
    url: "https://secure.hulu.com/account",
    steps: ["Sign in to your Hulu account on the web.", "Under Your Subscription, choose Cancel.", "Follow the prompts and keep the confirmation."],
    lastChecked: null,
  },
  {
    names: ["disney", "disney plus"],
    title: "Cancel Disney+",
    url: "https://www.disneyplus.com/account",
    steps: ["Sign in to your Disney+ account on the web.", "Open Account and choose your subscription.", "Choose Cancel Subscription and keep the confirmation."],
    lastChecked: null,
  },
  {
    names: ["youtube premium", "youtube music", "youtube tv"],
    title: "Cancel a YouTube Membership",
    url: "https://www.youtube.com/paid_memberships",
    steps: ["Sign in to YouTube on the web.", "Open Paid memberships and choose the one to end.", "Choose Deactivate or Cancel, and keep the confirmation."],
    lastChecked: null,
  },
  {
    names: ["amazon prime", "prime video"],
    title: "End an Amazon Prime Membership",
    url: "https://www.amazon.com/gp/primecentral",
    steps: ["Sign in to Amazon on the web.", "Open your Prime membership settings.", "Choose to end your membership and follow the prompts. Amazon may offer a refund for unused time."],
    lastChecked: null,
  },
  {
    names: ["dropbox"],
    title: "Cancel a Dropbox Plan",
    url: "https://www.dropbox.com/account/plan",
    steps: ["Sign in to Dropbox on the web.", "Open Plan, and choose to cancel or downgrade.", "Check how much storage you keep, and download anything you need first."],
    lastChecked: null,
  },
  {
    names: ["google one"],
    title: "Cancel Google One",
    url: "https://one.google.com/settings",
    steps: ["Sign in to Google One on the web.", "Open Settings and choose Cancel membership.", "Check what happens to your storage over the free limit before you confirm."],
    lastChecked: null,
  },
  {
    names: ["adobe"],
    title: "Cancel an Adobe Plan",
    url: "https://account.adobe.com/plans",
    steps: ["Sign in to your Adobe account.", "Open Plans, choose your plan, and select Manage plan, then Cancel plan.", "Check for an early cancellation fee on annual plans before you confirm."],
    lastChecked: null,
  },
  {
    names: ["microsoft 365"],
    title: "Cancel Microsoft 365",
    url: "https://account.microsoft.com/services",
    steps: ["Sign in to your Microsoft account.", "Open Services & subscriptions and find Microsoft 365.", "Choose Manage, then Cancel subscription, and keep the confirmation."],
    lastChecked: null,
  },
  {
    names: ["new york times", "nytimes"],
    title: "Cancel a New York Times Subscription",
    url: null,
    steps: [
      "Sign in to your New York Times account.",
      "Open Subscription, sometimes under Account, and look for Cancel.",
      "If there is no cancel button, use the site's help chat or the phone number on your account page, and ask for the cancellation in writing.",
    ],
    lastChecked: null,
  },
  // The fictional merchants in the demo profile.
  {
    names: ["streamflix"],
    title: "Cancel StreamFlix",
    url: null,
    steps: ["Sign in to your StreamFlix account.", "Open Account, then Membership, and choose Cancel.", "Keep the confirmation email."],
    lastChecked: null,
  },
  {
    names: ["showreel"],
    title: "Cancel Showreel",
    url: null,
    steps: ["Sign in to your Showreel account.", "Open Billing and choose Cancel Plan.", "Keep the confirmation email."],
    lastChecked: null,
  },
  {
    names: ["tunewave"],
    title: "Cancel Tunewave",
    url: null,
    steps: ["Sign in to your Tunewave account.", "Open Subscription and choose Cancel.", "Keep the confirmation email."],
    lastChecked: null,
  },
  {
    names: ["daily ledger news"],
    title: "Cancel Daily Ledger News",
    url: null,
    steps: [
      "Sign in to your Daily Ledger News account.",
      "Open Manage Subscription and choose Cancel.",
      "If it does not let you, contact customer care and ask them to cancel in writing.",
    ],
    lastChecked: null,
  },
  {
    names: ["peak fitness"],
    title: "Cancel Peak Fitness",
    url: null,
    steps: [
      "Check your membership agreement for the notice period and how to cancel. Many gyms need a form, a letter or a visit.",
      "Cancel in the way the agreement says, and keep a copy or a receipt.",
      "Check your next statement to see that the charge stopped.",
    ],
    lastChecked: null,
  },
  {
    names: ["skyvault storage"],
    title: "Cancel Skyvault Storage",
    url: null,
    steps: ["Sign in to your Skyvault account.", "Open Plan and turn off auto-renew before the renewal date.", "Keep the confirmation email."],
    lastChecked: null,
  },
];

const hasPhrase = (normalized: string, phrase: string) => ` ${normalized} `.includes(` ${phrase} `);

/** The catalog entry for a normalized merchant name, matching whole words, or null. */
export function findCancellationEntry(normalizedMerchant: string): CancellationEntry | null {
  return CANCELLATION_CATALOG.find((entry) => entry.names.some((name) => hasPhrase(normalizedMerchant, name))) ?? null;
}

/** The generic steps for each place a charge can be billed, when there is no catalog entry or the store is the only way. */
function genericGuide(channel: BillingChannel, name: string): Pick<CancellationGuide, "title" | "steps"> {
  switch (channel) {
    case "apple":
      return {
        title: "Cancel in Apple Subscriptions",
        steps: [
          "This charge is billed by Apple, so it can only be cancelled with Apple, not on the provider's own site.",
          "On an iPhone or iPad, open Settings, tap your name, then Subscriptions.",
          "Choose the subscription and tap Cancel Subscription. Apple emails a confirmation.",
        ],
      };
    case "google_play":
      return {
        title: "Cancel in Google Play",
        steps: [
          "This charge is billed by Google Play, so it can only be cancelled there, not on the provider's own site.",
          "Open the Play Store app, tap your profile picture, then Payments and subscriptions, then Subscriptions.",
          "Choose the subscription and cancel it.",
        ],
      };
    case "paypal":
      return {
        title: "Stop the Payment in PayPal",
        steps: [
          "This charge is billed through PayPal, so you can stop it there as well as with the provider.",
          "Log in to PayPal, open Settings, and look for Payments or Automatic payments.",
          "Choose the merchant and cancel the automatic payment. Also cancel with the provider so the account does not stay open.",
        ],
      };
    case "direct":
      return {
        title: `Cancel ${name}`,
        steps: [
          `Sign in to ${name}'s website or app.`,
          "Open Account or Billing and look for Cancel membership, Manage plan, or similar.",
          `If you cannot find it, contact ${name} by chat, email or phone, and ask them to cancel in writing.`,
          "Keep the confirmation, and check your next statement to see the charge stop.",
        ],
      };
  }
}

/**
 * The guide for one subscription. A charge billed through Apple, Google Play or PayPal is
 * cancelled there whatever the merchant, so the store's steps win. Otherwise the catalog entry for
 * the merchant is used, and the generic steps when there is none.
 */
export function buildCancellationGuide(input: { channel: BillingChannel; normalizedMerchant: string; displayName: string }): CancellationGuide {
  const { channel, normalizedMerchant, displayName } = input;
  if (channel === "direct") {
    const entry = findCancellationEntry(normalizedMerchant);
    if (entry) {
      return { channel, title: entry.title, steps: [...entry.steps], url: entry.url, source: "catalog", lastChecked: entry.lastChecked };
    }
  }
  const generic = genericGuide(channel, displayName.trim() || "the provider");
  return { channel, ...generic, url: null, source: "generic", lastChecked: null };
}
