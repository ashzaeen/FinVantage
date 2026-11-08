import type { CopilotContext } from "@finvantage/contracts";
import { parseUsdCents } from "./price";
import { SITE_RULES } from "./sites";

/**
 * Builds the only thing that leaves the browser. Reads only the price elements the site rule names.
 * Returns null when there is no rule or no clean price, and the Copilot then shows nothing.
 */
export function extractContext(doc: Document, location: Location): CopilotContext | null {
  const rule = SITE_RULES.find(
    (r) => r.host === location.hostname && r.path.test(location.pathname),
  );
  if (!rule) return null;

  const priceCents = readPrice(doc, rule.priceSelector);
  if (priceCents === null) return null;

  return {
    pageType: rule.pageType,
    itemType: rule.itemType,
    priceCents,
    merchant: rule.merchant,
  };
}

/** The first selector whose element holds a clean USD price. Only those elements are read. */
function readPrice(doc: Pick<Document, "querySelector">, selectors: string | readonly string[]): number | null {
  for (const selector of typeof selectors === "string" ? [selectors] : selectors) {
    const text = doc.querySelector(selector)?.textContent;
    const cents = text ? parseUsdCents(text) : null;
    if (cents !== null) return cents;
  }
  return null;
}
