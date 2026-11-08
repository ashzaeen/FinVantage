import type { ItemType, PageType } from "@finvantage/contracts";

export interface SiteRule {
  /** Matched against `location.hostname` and `location.pathname`. */
  host: string;
  path: RegExp;
  pageType: PageType;
  itemType: ItemType;
  merchant: string;
  /**
   * The primary listing price or cart total. Decoy prices elsewhere must not match. A list is
   * tried in order and the first element with a clean USD price wins, for sites whose layout
   * varies from page to page.
   */
  priceSelector: string | readonly string[];
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
  {
    // Product pages: /dp/<ASIN>, /<name>/dp/<ASIN>, /gp/product/<ASIN>, and the forms sponsored
    // results and old links use (/gp/aw/d/, /exec/obidos/ASIN/, /o/ASIN/). Amazon shows many
    // prices on one page (used offers, the struck-through list price, other colors, bundles),
    // so each selector targets the price to pay in the main offer. The first entry was checked
    // on laptops, earbuds, a Kindle, a book, a cable, and a console on 2026-11-07; the rest are
    // fallbacks for layouts that lack it. Amazon changes its markup, so recheck before a demo.
    host: "www.amazon.com",
    path: /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|o\/ASIN)\/[A-Z0-9]{10}(?:[/?]|$)/,
    pageType: "checkout",
    itemType: "retail_purchase",
    merchant: "Amazon",
    priceSelector: [
      "#corePriceDisplay_desktop_feature_div .priceToPay",
      "#apex-pricetopay-accessibility-label",
      "#corePrice_feature_div .a-offscreen",
    ],
  },
  // TODO(extension): selectors for zillow.com, apartments.com, bestbuy.com, apple.com, and
  // carmax.com. They are in manifest.json but inert until a rule exists.
];
