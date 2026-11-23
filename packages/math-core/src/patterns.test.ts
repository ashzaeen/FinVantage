import assert from "node:assert/strict";
import { test } from "node:test";
import { spendingPatterns, transactionSummary, type SpendRow } from "./patterns";

const row = (date: string, merchant: string, cents: number): SpendRow => ({ date, merchant, cents });

// Dec 1, 2026 is a Tuesday.
const ROWS: SpendRow[] = [
  row("2026-12-01", "Green Grocer", 10_000),
  row("2026-12-01", "Sunrise Diner", 2_000),
  row("2026-12-03", "Green Grocer", 5_000),
  row("2026-12-06", "Cafe Nine", 1_500),
  row("2026-11-30", "Green Grocer", 7_000),
];

test("a month's spending adds up, by day and by merchant", () => {
  const p = spendingPatterns(ROWS, "2026-12", "2026-12-07");
  assert.equal(p.spentCents, 18_500);
  assert.deepEqual(p.dailyCents, { "2026-12-01": 12_000, "2026-12-03": 5_000, "2026-12-06": 1_500 });
  assert.equal(p.through, "2026-12-07");
  assert.deepEqual(p.topMerchants.map((m) => [m.merchant, m.totalCents, m.visits]), [["Green Grocer", 15_000, 2], ["Sunrise Diner", 2_000, 1], ["Cafe Nine", 1_500, 1]]);
  assert.equal(p.topMerchants[0]!.share, 15_000 / 18_500);
  assert.equal(p.topMerchantsShare, 1);
});

test("no-spend days and streaks count inside the month, and the current streak can reach back", () => {
  const p = spendingPatterns(ROWS, "2026-12", "2026-12-07");
  // Dec 2, 4, 5 and 7 had nothing.
  assert.equal(p.noSpendDays, 4);
  assert.equal(p.longestNoSpendStreak, 2);
  assert.equal(p.currentNoSpendStreak, 1);

  // Early in the month, a quiet start continues the streak from the last day of the month before.
  const early = spendingPatterns([row("2026-11-28", "Green Grocer", 1_000)], "2026-12", "2026-12-03");
  assert.equal(early.currentNoSpendStreak, 5);
  assert.equal(early.noSpendDays, 3);
});

test("a past month runs to its last day and ignores later rows", () => {
  const p = spendingPatterns(ROWS, "2026-11", "2026-12-07");
  assert.equal(p.through, "2026-11-30");
  assert.equal(p.spentCents, 7_000);
  assert.equal(p.noSpendDays, 29);
});

test("weekday averages use the last 90 days and split weekdays from weekends", () => {
  // The 90 days run Sep 9 to Dec 7, which holds 12 Tuesdays (Sep 15 to Dec 1). Dec 1, a Tuesday,
  // had 12_000, so the Tuesday average is that spread over all 12, not just the days with spending.
  const p = spendingPatterns(ROWS, "2026-12", "2026-12-07");
  assert.equal(p.weekday.length, 7);
  const tuesdays = 12;
  assert.equal(p.weekday[2]!.averageCents, Math.round(12_000 / tuesdays));
  assert.ok(p.weekendAverageCents >= 0 && p.weekdayAverageCents > 0);
  // Weekend days here: Dec 6 (Sunday) had 1_500 and Nov 30 and others none.
  assert.ok(p.weekdayAverageCents > p.weekendAverageCents);
});

test("an empty month is all zeros, not an error", () => {
  const p = spendingPatterns([], "2026-12", "2026-12-07");
  assert.equal(p.spentCents, 0);
  assert.equal(p.noSpendDays, 7);
  assert.equal(p.topMerchants.length, 0);
  assert.equal(p.topMerchantsShare, 0);
});

test("a transaction summary totals in and out and fills six months, oldest first", () => {
  const s = transactionSummary(
    [
      { date: "2026-12-01", amountCents: 285_000 },
      { date: "2026-12-02", amountCents: -4_282 },
      { date: "2026-11-30", amountCents: -14_278 },
      { date: "2026-03-01", amountCents: -999 }, // outside the six months: counted in the totals only
    ],
    "2026-12-07",
  );
  assert.equal(s.count, 4);
  assert.equal(s.inCents, 285_000);
  assert.equal(s.outCents, 4_282 + 14_278 + 999);
  assert.equal(s.netCents, s.inCents - s.outCents);
  assert.deepEqual(s.byMonth.map((m) => m.month), ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.deepEqual(s.byMonth.at(-1), { month: "2026-12", inCents: 285_000, outCents: 4_282 });
  assert.deepEqual(s.byMonth.at(-2), { month: "2026-11", inCents: 0, outCents: 14_278 });
});
