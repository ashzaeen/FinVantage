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
    merchant: "Hearth Rentals",
    priceSelector: "[data-testid='listing-price']",
  },
  {
    host: "localhost",
    path: /product/,
    pageType: "checkout",
    itemType: "retail_purchase",
    merchant: "Circuit & Co.",
    priceSelector: "[data-testid='product-price']",
  },
  {
    host: "localhost",
    path: /checkout/,
    pageType: "checkout",
    itemType: "retail_purchase",
    merchant: "Circuit & Co.",
    priceSelector: "[data-testid='cart-total']",
  },
  {
    host: "localhost",
    path: /car-quote/,
    pageType: "vehicle_financing",
    itemType: "vehicle",
    merchant: "Meridian Motors",
    priceSelector: "[data-testid='vehicle-price']",
  },
  {
    host: "localhost",
    path: /card-payment/,
    pageType: "debt_payment",
    itemType: "credit_card_payment",
    merchant: "Demo Bank",
    priceSelector: "[data-testid='payment-amount']",
  },
  // TODO(extension): selectors for zillow.com, apartments.com, bestbuy.com, amazon.com,
  // apple.com, and carmax.com. They are in manifest.json but inert until a rule exists.
];
