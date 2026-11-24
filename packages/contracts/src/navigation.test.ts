import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_PAGES, isAppHref, navigationSpeech, pageByKey, pageByName, pageHref } from "./navigation";

test("every page has a unique key, href and alias, so a name means one page", () => {
  assert.equal(new Set(APP_PAGES.map((p) => p.key)).size, APP_PAGES.length);
  assert.equal(new Set(APP_PAGES.map((p) => p.href)).size, APP_PAGES.length);
  const aliases = APP_PAGES.flatMap((p) => p.aliases);
  assert.equal(new Set(aliases).size, aliases.length, "an alias points at one page only");
});

test("a spoken page name is found by alias, ignoring case, punctuation, 'the', 'my' and 'page'", () => {
  assert.equal(pageByName("Subscriptions")?.key, "subscriptions");
  assert.equal(pageByName("the Advisor page.")?.key, "advisor");
  assert.equal(pageByName("my goals")?.key, "goals");
  assert.equal(pageByName("Credit score")?.key, "credit");
  assert.equal(pageByName("portfolio tab")?.key, "investments");
  assert.equal(pageByName("somewhere else"), undefined);
  assert.equal(pageByName(""), undefined);
});

test("only Transactions takes a search, and it is trimmed and encoded", () => {
  const tx = pageByKey("transactions")!;
  assert.equal(pageHref(tx), "/transactions");
  assert.equal(pageHref(tx, "  Trader   Joe's  "), "/transactions?search=Trader%20Joe's");
  assert.equal(pageHref(pageByKey("goals")!, "anything"), "/goals", "other pages ignore a search");
  assert.equal(pageHref(tx, "x".repeat(200)).length, "/transactions?search=".length + 60);
});

test("a link is safe only if it is one of the pages, or a Transactions search", () => {
  for (const href of ["/app", "/advisor", "/portfolio", "/transactions", "/transactions?search=coffee"]) assert.ok(isAppHref(href), href);
  for (const href of ["https://evil.example", "//evil.example", "/admin", "/goals?next=https://evil", "/transactions?search=a&x=1", "/transactions?other=1", "/advisor?search=x", "/app/../x", `/transactions?search=${"a".repeat(80)}`, "/app?x"]) {
    assert.equal(isAppHref(href), false, href);
  }
});

test("what is said matches what happens", () => {
  assert.equal(navigationSpeech(pageByKey("subscriptions")!), "Opening Subscriptions.");
  assert.equal(navigationSpeech(pageByKey("transactions")!, "Starbucks"), "Searching your transactions for Starbucks.");
  assert.equal(navigationSpeech(pageByKey("transactions")!), "Opening Transactions.");
});

test("the words for a link come from the link itself, and a link that is not a page has none", async () => {
  const { speechForHref } = await import("./navigation");
  assert.equal(speechForHref("/subscriptions"), "Opening Subscriptions.");
  assert.equal(speechForHref("/transactions?search=Starbucks"), "Searching your transactions for Starbucks.");
  assert.equal(speechForHref("https://evil.example"), null);
});
