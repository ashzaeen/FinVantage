import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "@finvantage/contracts";
import {
  amortizationByYear,
  averageMonthlyOutflow,
  cardValueFigures,
  cutCoverage,
  growthSeries,
  loanFigures,
  savingsPath,
} from "./advisor";

test("amortization years add up to the loan, with interest falling each year", () => {
  const years = amortizationByYear(2_500_000, 0.13, 60);
  assert.equal(years.length, 5);
  assert.equal(years.reduce((s, y) => s + y.principalCents, 0), 2_500_000);
  assert.equal(years.at(-1)!.balanceCents, 0);
  assert.ok(years[0]!.interestCents > years[4]!.interestCents);
  const total = loanFigures(2_800_000, 300_000, 0.13, 60).totalInterestCents;
  assert.ok(Math.abs(years.reduce((s, y) => s + y.interestCents, 0) - total) < 100, "within rounding of the payment total");
});

test("growth series gives one value per rate, starting at what was put in", () => {
  const series = growthSeries(50_000, 10_000, 10, [0.105, 0.135, -0.02]);
  assert.equal(series.length, 11);
  assert.deepEqual(series[0]!.valuesCents, [50_000, 50_000, 50_000]);
  assert.equal(series[10]!.contributedCents, 50_000 + 10_000 * 120);
  const [sp, nasdaq, falling] = series[10]!.valuesCents as [number, number, number];
  assert.ok(nasdaq > sp && sp > series[10]!.contributedCents && falling < series[10]!.contributedCents);
});

test("a savings path climbs by the monthly amount to the date", () => {
  const path = savingsPath(10_000, 30_000, 4, "2026-11-08");
  assert.deepEqual(path.map((p) => p.savedCents), [10_000, 40_000, 70_000, 100_000, 130_000]);
  assert.equal(path.at(-1)!.date, "2027-03-08");
});

test("cut coverage caps at the whole need", () => {
  assert.deepEqual(cutCoverage([10_000, 5_000], 30_000), { coveredCents: 15_000, share: 0.5 });
  assert.equal(cutCoverage([40_000], 30_000).share, 1);
  assert.equal(cutCoverage([1], null).share, null);
});

test("card spending averages money out of card accounts only", () => {
  const tx = (accountId: string, date: string, amountCents: number) => ({ id: date + accountId + amountCents, accountId, date, amountCents, merchant: "m", category: null, isRecurring: false }) as Transaction;
  const avg = averageMonthlyOutflow([tx("card", "2026-10-01", -60_000), tx("card", "2026-09-01", -30_000), tx("checking", "2026-10-01", -99_000), tx("card", "2026-10-05", 20_000)], new Set(["card"]), ["2026-09", "2026-10", "2026-08"]);
  assert.equal(avg, 30_000);
});

test("a rewards card's year: rewards minus fee, and minus interest when a balance is carried", () => {
  const base = { monthlySpendCents: 100_000, rewardsRate: 0.015, annualFeeCents: 0, aprRate: 0.2, carriedBalanceCents: 300_000 };
  const inFull = cardValueFigures({ ...base, paysInFull: true });
  assert.equal(inFull.annualRewardsCents, 18_000);
  assert.equal(inFull.netCents, 18_000);
  const carried = cardValueFigures({ ...base, paysInFull: false });
  assert.equal(carried.annualInterestCents, 60_000);
  assert.equal(carried.netCents, 18_000 - 60_000);
  assert.equal(cardValueFigures({ ...base, annualFeeCents: 25_000, paysInFull: true }).rewardsBeatFee, false);
});

test("spending falls back to this month when the last full months are empty", async () => {
  const { spendingMonths } = await import("./advisor");
  const tx = (date: string) => ({ id: date, accountId: "a", date, amountCents: -1_000, merchant: "m", category: "dining_out", isRecurring: false }) as Transaction;
  assert.deepEqual(spendingMonths([tx("2026-11-03")], "2026-11-08"), { months: ["2026-11"], basis: "this_month" });
  assert.equal(spendingMonths([tx("2026-10-03")], "2026-11-08").basis, "full_months");
});
