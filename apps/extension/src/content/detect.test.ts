import assert from "node:assert/strict";
import { test } from "node:test";
import { extractContext } from "./detect";

/** A page reduced to the elements a rule may read: selector -> textContent. */
function page(elements: Record<string, string>): Document {
  return {
    querySelector: (selector: string) => (selector in elements ? { textContent: elements[selector] } : null),
  } as unknown as Document;
}

function at(url: string): Location {
  const { hostname, pathname } = new URL(url);
  return { hostname, pathname } as Location;
}

const PAY = "#corePriceDisplay_desktop_feature_div .priceToPay";
const A11Y = "#apex-pricetopay-accessibility-label";
const BUYBOX = "#corePrice_feature_div .a-offscreen";

test("an Amazon product page sends the price to pay, merchant Amazon", () => {
  // Text shapes seen on a live page, 2026-11-07: $319.96 to pay, $539.00 list, $269.99 used.
  const doc = page({ [PAY]: "$319.96", [A11Y]: "$319.96 with 41 percent savings", [BUYBOX]: "$319.96" });
  assert.deepEqual(extractContext(doc, at("https://www.amazon.com/HP-Laptop/dp/B0HGFTXXXM?th=1")), {
    pageType: "checkout",
    itemType: "retail_purchase",
    priceCents: 31_996,
    merchant: "Amazon",
  });
});

test("Amazon product URLs in every common shape match", () => {
  const doc = page({ [PAY]: "$1,099.00" });
  for (const url of [
    "https://www.amazon.com/dp/B0GR1JTFP8",
    "https://www.amazon.com/Apple-MacBook-Air/dp/B0GR1JTFP8/ref=sr_1_1",
    "https://www.amazon.com/gp/product/B0GR1JTFP8",
    "https://www.amazon.com/dp/1668236516",
    // Sponsored search results link here; reported broken on 2026-11-07.
    "https://www.amazon.com/gp/aw/d/B0HPMH6WP9?pd_rd_plhdr=t&qid=1794111994&sr=1-2",
    "https://www.amazon.com/exec/obidos/ASIN/B0HPMH6WP9",
    "https://www.amazon.com/o/ASIN/B0HPMH6WP9",
  ]) {
    assert.equal(extractContext(doc, at(url))?.priceCents, 109_900, url);
  }
});

test("Amazon pages that are not a product page show nothing", () => {
  const doc = page({ [PAY]: "$19.99" });
  for (const url of ["https://www.amazon.com/", "https://www.amazon.com/s?k=laptop", "https://www.amazon.com/gp/cart/view.html"]) {
    assert.equal(extractContext(doc, at(url)), null, url);
  }
});

test("falls back in order when the first selector is missing or empty", () => {
  const url = at("https://www.amazon.com/dp/1668236516");
  assert.equal(extractContext(page({ [A11Y]: "$12.99 with 35 percent savings" }), url)?.priceCents, 1_299);
  assert.equal(extractContext(page({ [PAY]: "", [BUYBOX]: "$9.99" }), url)?.priceCents, 999);
});

test("an Amazon page with no clean USD price shows nothing", () => {
  const url = at("https://www.amazon.com/dp/B0DG2G8Q46");
  assert.equal(extractContext(page({}), url), null);
  assert.equal(extractContext(page({ [PAY]: "Currently unavailable." }), url), null);
  assert.equal(extractContext(page({ [PAY]: "CA$429.99" }), url), null);
});

test("the demo pages still work with a single selector", () => {
  const doc = page({ "[data-testid='listing-price']": "$1,950/mo" });
  assert.deepEqual(extractContext(doc, at("http://localhost:4100/rental.html")), {
    pageType: "rental",
    itemType: "rent_monthly",
    priceCents: 195_000,
    merchant: "Hearth Rentals",
  });
});
