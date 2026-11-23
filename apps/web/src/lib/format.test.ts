import assert from "node:assert/strict";
import { test } from "node:test";
import { compactUsd, daysBetween, humanize, longDate, monthName, monthYear, plural, relativeDays, shortDate } from "./format";

test("short dates and month names", () => {
  assert.equal(shortDate("2026-12-04"), "Dec 4");
  assert.equal(shortDate("not a date"), "not a date");
  assert.equal(monthName("2026-03"), "Mar");
  assert.equal(monthYear("2028-03-14"), "Mar 2028");
  assert.equal(monthYear("soon"), "soon");
});

test("compact money keeps small amounts whole and trims a trailing .0", () => {
  assert.equal(compactUsd(99_900), "$999");
  assert.equal(compactUsd(100_000), "$1K");
  assert.equal(compactUsd(123_400), "$1.2K");
  assert.equal(compactUsd(3_850_000), "$38.5K");
  assert.equal(compactUsd(250_000_000), "$2.5M");
  assert.equal(compactUsd(-123_400), "−$1.2K");
});

test("day counts and their wording", () => {
  assert.equal(daysBetween("2026-12-01", "2026-12-04"), 3);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(relativeDays("2026-12-03", "2026-12-03"), "today");
  assert.equal(relativeDays("2026-12-03", "2026-12-04"), "tomorrow");
  assert.equal(relativeDays("2026-12-03", "2026-12-10"), "in 7 days");
  assert.equal(relativeDays("2026-12-03", "2026-12-01"), "2 days ago");
  assert.equal(plural(1, "day"), "1 day");
  assert.equal(plural(2, "category", "categories"), "2 categories");
});

test("a full date reads as month, day and year, and anything else is left alone", () => {
  assert.equal(longDate("2029-09-01"), "Sep 1, 2029");
  assert.equal(longDate("2026-12-03"), "Dec 3, 2026");
  assert.equal(longDate("2026-12"), "2026-12");
  assert.equal(longDate("soon"), "soon");
  assert.equal(monthYear("2026-12"), "Dec 2026");
});

test("an id shown without a label is made readable", () => {
  assert.equal(humanize("debt_payments"), "Debt Payments");
  assert.equal(humanize("dining-out"), "Dining Out");
  assert.equal(humanize("groceries"), "Groceries");
});
