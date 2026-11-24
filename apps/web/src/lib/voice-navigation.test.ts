import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_PAGES, isAppHref } from "@finvantage/contracts";
import { NAV_ITEMS } from "./nav";
import { spokenNavigation } from "./voice-navigation";

test("the pages a voice command can open are exactly the pages in the sidebar", () => {
  const sidebar = NAV_ITEMS.map((i) => [i.href, i.label]).sort();
  const voice = APP_PAGES.map((p) => [p.href, p.label]).sort();
  assert.deepEqual(voice, sidebar);
});

test("a clear command opens that page, however it is worded", () => {
  const cases: Array<[string, string]> = [
    ["open Subscriptions", "/subscriptions"],
    ["Go to my goals.", "/goals"],
    ["show me the spending page", "/spending"],
    ["take me to credit", "/credit"],
    ["pull up my accounts", "/accounts"],
    ["navigate to the portfolio", "/portfolio"],
    ["open settings", "/settings"],
    ["show the dashboard", "/app"],
  ];
  for (const [said, href] of cases) assert.equal(spokenNavigation(said)?.href, href, said);
  assert.equal(spokenNavigation("open Subscriptions")?.said, "Opening Subscriptions.");
});

test("a merchant or words before 'transactions' become a search on that page", () => {
  assert.equal(spokenNavigation("show my Starbucks transactions")?.href, "/transactions?search=starbucks");
  assert.equal(spokenNavigation("find all Amazon transactions")?.href, "/transactions?search=amazon");
  assert.equal(spokenNavigation("search transactions for trader joe's")?.href, "/transactions?search=trader%20joe's");
  assert.equal(spokenNavigation("show my Uber transactions")?.said, "Searching your transactions for uber.");
});

test("'my transactions' and 'recent transactions' are the page, not a search for those words", () => {
  for (const said of ["show my transactions", "open transactions", "show my recent transactions", "show all transactions", "show me the latest transactions"]) {
    assert.equal(spokenNavigation(said)?.href, "/transactions", said);
  }
});

test("anything vaguer, longer or not a page goes to the Advisor instead", () => {
  for (const said of ["show me where my money goes", "open the pod bay doors", "can you open subscriptions and cancel streamflix", "what is my spending", "", "open", "yes", "go to the moon"]) {
    assert.equal(spokenNavigation(said), null, JSON.stringify(said));
  }
});

test("every link it makes is one the app allows", () => {
  for (const said of ["open goals", "show my coffee transactions", "pull up my accounts"]) assert.ok(isAppHref(spokenNavigation(said)!.href), said);
});
