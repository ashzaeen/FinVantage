import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUsdCents } from "./price";

test("parses common USD formats", () => {
  assert.equal(parseUsdCents("$1,950/mo"), 195_000);
  assert.equal(parseUsdCents("$1,499.99"), 149_999);
  assert.equal(parseUsdCents(" $28000 "), 2_800_000);
});

test("skips non-USD and non-prices", () => {
  assert.equal(parseUsdCents("€1,499"), null);
  assert.equal(parseUsdCents("Contact for price"), null);
  assert.equal(parseUsdCents("$0"), null);
});

test("skips dollar prices in other currencies", () => {
  assert.equal(parseUsdCents("$1,499 CAD"), null);
  assert.equal(parseUsdCents("CA$1,499"), null);
  assert.equal(parseUsdCents("A$1,499.00"), null);
  assert.equal(parseUsdCents("MX$28,000"), null);
  assert.equal(parseUsdCents("USD $1,499"), 149_900);
});
