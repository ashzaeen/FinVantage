import { CopilotContext } from "@finvantage/contracts";

/**
 * What the Chrome extension sends to FinVantage when you open a shopping page. These four fields
 * are the whole of `CopilotContext`, a strict schema that refuses anything extra. A test checks
 * this list against it, so the Privacy Center cannot drift from what is really sent.
 */
export const EXTENSION_FIELDS = [
  { key: "pageType", label: "Kind of Page", example: "checkout", note: "Whether it is a checkout, a rental listing, a car financing page or a debt payment." },
  { key: "itemType", label: "Kind of Item", example: "retail_purchase", note: "A general kind of thing, such as a retail purchase or a monthly rent." },
  { key: "priceCents", label: "Price", example: "$329", note: "The one price the page shows for it." },
  { key: "merchant", label: "Store Name", example: "Northwind Store", note: "The name of the site." },
] as const satisfies readonly { key: keyof CopilotContext; label: string; example: string; note: string }[];

/** Things the extension never reads or sends. */
export const NEVER_SENT = [
  "The text of the page",
  "Your browsing history",
  "Screenshots",
  "Anything you type into a form",
  "Your name, email or bank details",
] as const;
