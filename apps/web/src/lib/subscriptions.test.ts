import assert from "node:assert/strict";
import { test } from "node:test";
import type { SubscriptionFlag } from "@finvantage/contracts";
import { flagDetail, needsLook, shortDate, sortSubscriptions, upcomingWithin } from "./subscriptions";

const flag = (overrides: Partial<SubscriptionFlag> & Pick<SubscriptionFlag, "type">): SubscriptionFlag => ({
  previousCents: null,
  currentCents: null,
  changedOn: null,
  group: null,
  ...overrides,
});

const item = (merchant: string, monthlyCents: number | null, nextDate: string, flags: SubscriptionFlag[] = []) => ({ merchant, monthlyCents, nextDate, flags });

test("a date is shown as month and day, whatever the time zone", () => {
  assert.equal(shortDate("2026-10-03"), "Oct 3");
  assert.equal(shortDate("2026-12-31"), "Dec 31");
  assert.equal(shortDate("2027-01-01"), "Jan 1");
  assert.equal(shortDate("not-a-date"), "not-a-date");
});

test("each flag is explained with the figures the API sent", () => {
  const sub = { amountCents: -1549, nextDate: "2026-12-03" };
  assert.equal(flagDetail(flag({ type: "price_up", previousCents: 1199, changedOn: "2026-10-03" }), sub), "Was $11.99, now $15.49 since Oct 3.");
  assert.equal(flagDetail(flag({ type: "possible_duplicate", group: "Video Streaming" }), sub), "You pay for more than one Video Streaming service.");
  assert.equal(flagDetail(flag({ type: "started_recently" }), sub), "The first charge was in the last two months.");
  assert.equal(flagDetail(flag({ type: "still_charging", changedOn: "2026-11-03" }), sub), "Charged again on Nov 3 after you cancelled.");
  assert.equal(flagDetail(flag({ type: "annual_coming" }), { amountCents: -9999, nextDate: "2026-11-26" }), "Renews Nov 26 for $99.99.");
});

test("a flag missing its figures still reads as a sentence", () => {
  const sub = { amountCents: -1549, nextDate: "2026-12-03" };
  assert.equal(flagDetail(flag({ type: "price_up" }), sub), "The price went up to $15.49.");
  // A bill shows its usual amount, so the sentence uses the latest charge the flag carries and says
  // why the row shows a different figure.
  assert.equal(
    flagDetail(flag({ type: "price_up", previousCents: 8285, currentCents: 8732, changedOn: "2026-11-18" }), { ...sub, amountCents: -10131 }),
    "The latest charge was $87.32, up from $82.85 since Nov 18. The $101.31 shown is the bank's usual amount.",
  );
  // When the row shows the same figure, nothing needs explaining.
  assert.equal(
    flagDetail(flag({ type: "price_up", previousCents: 1199, currentCents: 1549, changedOn: "2026-10-03" }), sub),
    "Was $11.99, now $15.49 since Oct 3.",
  );
  assert.equal(flagDetail(flag({ type: "possible_duplicate" }), sub), "You may pay for the same thing twice.");
  assert.equal(flagDetail(flag({ type: "still_charging" }), sub), "Charged again after you cancelled.");
});

test("sorting by cost puts the dearest first and unknown costs last, with ties by name", () => {
  const items = [item("Beta", 1000, "2026-12-01"), item("Odd", null, "2026-12-01"), item("Alpha", 1000, "2026-12-01"), item("Big", 5000, "2026-12-01")];
  assert.deepEqual(sortSubscriptions(items, "cost").map((i) => i.merchant), ["Big", "Alpha", "Beta", "Odd"]);
});

test("sorting by next charge and by name", () => {
  const items = [item("Beta", 1, "2026-12-09"), item("Alpha", 1, "2026-12-20"), item("Gamma", 1, "2026-12-09")];
  assert.deepEqual(sortSubscriptions(items, "next").map((i) => i.merchant), ["Beta", "Gamma", "Alpha"]);
  assert.deepEqual(sortSubscriptions(items, "name").map((i) => i.merchant), ["Alpha", "Beta", "Gamma"]);
});

test("sorting leaves the list it was given alone", () => {
  const items = [item("B", 1, "2026-12-01"), item("A", 2, "2026-12-01")];
  sortSubscriptions(items, "name");
  assert.deepEqual(items.map((i) => i.merchant), ["B", "A"]);
});

test("only flagged charges need a look, dearest first", () => {
  const items = [
    item("Quiet", 9000, "2026-12-01"),
    item("Small", 500, "2026-12-01", [flag({ type: "started_recently" })]),
    item("Large", 4000, "2026-12-01", [flag({ type: "price_up" })]),
  ];
  assert.deepEqual(needsLook(items).map((i) => i.merchant), ["Large", "Small"]);
  assert.deepEqual(needsLook([item("Quiet", 1, "2026-12-01")]), []);
});

test("upcoming charges run from today to the last day, soonest first, ends included", () => {
  const items = [
    item("Past", 1, "2026-11-19"),
    item("Today", 1, "2026-11-20"),
    item("Soon", 1, "2026-11-26"),
    item("Last", 1, "2026-12-20"),
    item("Later", 1, "2026-12-21"),
  ];
  assert.deepEqual(upcomingWithin(items, "2026-11-20", 30).map((i) => i.merchant), ["Today", "Soon", "Last"]);
  assert.deepEqual(upcomingWithin([], "2026-11-20", 30), []);
});
