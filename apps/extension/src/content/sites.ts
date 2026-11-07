import type { ItemType, PageType } from "@finvantage/contracts";

export interface SiteRule {
  /** Matched against `location.hostname` and `location.pathname`. */
  host: string;
  path: RegExp;
  pageType: PageType;
  itemType: ItemType;
  merchant: string;
  /** The primary listing price or cart total. Decoy prices elsewhere must not match. */
  priceSelector: string;
}

/**
 * P0 runs on the mock pages, which work whatever live sites do to their markup.
 * Live sites are a bonus: add a rule here and its domain to manifest.json.
 */
export const SITE_RULES: SiteRule[] = [
  {
    host: "localhost",
    path: /rental/,
    pageType: "rental",
    itemType: "rent_monthly",
    merchant: "Demo Rentals",
    priceSelector: "[data-testid='listing-price']",
  },
  {
    host: "localhost",
    path: /checkout/,
    pageType: "checkout",
    itemType: "retail_purchase",
    merchant: "Demo Electronics",
    priceSelector: "[data-testid='cart-total']",
  },
  {
    host: "localhost",
    path: /car-quote/,
    pageType: "vehicle_financing",
    itemType: "vehicle",
    merchant: "Demo Motors",
    priceSelector: "[data-testid='vehicle-price']",
  },
  // TODO(extension): selectors for zillow.com, apartments.com, bestbuy.com, amazon.com,
  // apple.com, and carmax.com. They are in manifest.json but inert until a rule exists.
];
