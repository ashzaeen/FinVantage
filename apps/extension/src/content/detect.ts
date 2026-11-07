import type { CopilotContext } from "@finvantage/contracts";
import { parseUsdCents } from "./price";
import { SITE_RULES } from "./sites";

/**
 * Builds the only thing that leaves the browser. Reads one element chosen by the site rule.
 * Returns null when there is no rule or no clean price, and the Copilot then shows nothing.
 */
export function extractContext(doc: Document, location: Location): CopilotContext | null {
  const rule = SITE_RULES.find(
    (r) => r.host === location.hostname && r.path.test(location.pathname),
  );
  if (!rule) return null;

  const text = doc.querySelector(rule.priceSelector)?.textContent;
  const priceCents = text ? parseUsdCents(text) : null;
  if (priceCents === null) return null;

  return {
    pageType: rule.pageType,
    itemType: rule.itemType,
    priceCents,
    merchant: rule.merchant,
  };
}
