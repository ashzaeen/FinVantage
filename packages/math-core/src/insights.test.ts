import assert from "node:assert/strict";
import { test } from "node:test";
import type { Account, Goal } from "@finvantage/contracts";
import { creditCardsOverview, goalMilestones, liquidCashCents, liquidityOf, nextPayday, overviewInsights } from "./insights";

const account = (over: Partial<Account> & Pick<Account, "id" | "type" | "balanceCents">): Account => ({
  userId: "u", loanKind: null, name: over.id, institution: "Demo Bank", annualRate: null, minimumPaymentCents: null, promoRateEndsOn: null,
  subtype: null, mask: null, availableBalanceCents: null, creditLimitCents: null, nextPaymentDueOn: null, ...over,
});

test("runway divides cash by the recent average, skipping the current month", () => {
  const trend = [
    { month: "2026-06", incomeCents: 0, spendingCents: 0, savedCents: 0 }, // too early to count
    { month: "2026-07", incomeCents: 500_000, spendingCents: 400_000, savedCents: 100_000 },
    { month: "2026-08", incomeCents: 500_000, spendingCents: 300_000, savedCents: 200_000 },
    { month: "2026-09", incomeCents: 500_000, spendingCents: 500_000, savedCents: 0 },
    { month: "2026-10", incomeCents: 500_000, spendingCents: 400_000, savedCents: 50_000 },
    { month: "2026-11", incomeCents: 250_000, spendingCents: 100_000, savedCents: 50_000 }, // this month
  ];
  const insights = overviewInsights(1_200_000, trend);
  // The three full months before November: Aug, Sep, Oct.
  assert.equal(insights.runway.averageMonthlySpendCents, 400_000);
  assert.equal(insights.runway.months, 3);
  assert.equal(insights.savingsRate.rate, 0.2);
  assert.deepEqual(insights.savingsRate.trend.map((p) => p.rate), [null, 0.2, 0.4, 0, 0.1, 0.2]);
});

test("with no spending history there is no runway and no rate to show", () => {
  const insights = overviewInsights(500_000, [{ month: "2026-11", incomeCents: 0, spendingCents: 0, savedCents: 0 }]);
  assert.equal(insights.runway.months, null);
  assert.equal(insights.runway.averageMonthlySpendCents, 0);
  assert.equal(insights.savingsRate.rate, null);
});

test("cash is checking and savings; liquidity splits the rest by how reachable it is", () => {
  const accounts = [
    account({ id: "c", type: "checking", balanceCents: 340_000 }),
    account({ id: "s", type: "savings", balanceCents: 1_000_000 }),
    account({ id: "cd", type: "cd", balanceCents: 500_000 }),
    account({ id: "ira", type: "ira", balanceCents: 4_000_000 }),
    account({ id: "b", type: "brokerage", balanceCents: 900_000 }),
    account({ id: "card", type: "credit_card", balanceCents: 123_456 }), // a debt is not an asset
  ];
  assert.equal(liquidCashCents(accounts), 1_340_000);
  assert.deepEqual(liquidityOf(accounts), { cashCents: 1_340_000, sellableCents: 900_000, lockedCents: 4_500_000 });
});

test("a credit card's interest is balance times rate over twelve, and utilization pools every limit", () => {
  const accounts = [
    account({ id: "cash", type: "credit_card", name: "Cash Rewards", balanceCents: 130_316, creditLimitCents: 800_000, annualRate: 0.2299, mask: "3005" }),
    account({ id: "promo", type: "credit_card", name: "0% Promo", balanceCents: 180_000, creditLimitCents: 600_000, annualRate: 0, promoRateEndsOn: "2027-06-30" }),
    account({ id: "nolimit", type: "credit_card", name: "No Limit", balanceCents: 10_000, creditLimitCents: null }),
    account({ id: "auto", type: "loan", loanKind: "auto", balanceCents: 900_000 }),
    account({ id: "mort", type: "mortgage", balanceCents: 10_000_000 }),
    account({ id: "chk", type: "checking", balanceCents: 1 }),
  ];
  const o = creditCardsOverview(accounts, "2026-12-03");
  assert.deepEqual(o.cards.map((c) => c.id), ["promo", "cash", "nolimit"]); // by balance, biggest first
  const cash = o.cards.find((c) => c.id === "cash")!;
  assert.equal(cash.monthlyInterestCents, Math.round((130_316 * 0.2299) / 12));
  assert.equal(cash.utilization, 130_316 / 800_000);
  assert.equal(o.cards.find((c) => c.id === "promo")!.monthlyInterestCents, 0);
  // The promo ends Jun 30 2027: 209 days from Dec 3, so 7 months of payments to clear $1,800.
  assert.deepEqual(o.cards.find((c) => c.id === "promo")!.promoClear, { daysLeft: 209, monthlyToClearCents: Math.ceil(180_000 / 7) });
  assert.equal(o.cards.find((c) => c.id === "cash")!.promoClear, null);
  assert.equal(o.asOf, "2026-12-03");
  assert.equal(o.cards.find((c) => c.id === "nolimit")!.utilization, null);
  // Due dates count from today, and a date that has passed is negative.
  const dated = creditCardsOverview(
    [
      account({ id: "soon", type: "credit_card", balanceCents: 100, nextPaymentDueOn: "2026-12-25" }),
      account({ id: "late", type: "credit_card", balanceCents: 100, nextPaymentDueOn: "2026-12-01" }),
      account({ id: "none", type: "credit_card", balanceCents: 100 }),
      account({ id: "over", type: "credit_card", balanceCents: 100, promoRateEndsOn: "2026-11-01" }),
    ],
    "2026-12-03",
  );
  assert.deepEqual(dated.cards.map((c) => [c.id, c.daysUntilDue]).sort(), [["late", -2], ["none", null], ["over", null], ["soon", 22]]);
  assert.equal(dated.cards.find((c) => c.id === "over")!.promoClear, null, "a promo that has ended has nothing to clear");
  assert.equal(o.totals.limitCents, 1_400_000);
  assert.equal(o.totals.utilization, (130_316 + 180_000) / 1_400_000); // the card with no limit stays out
  assert.deepEqual(o.mix, [{ label: "Credit card", count: 3 }, { label: "Auto loan", count: 1 }, { label: "Mortgage", count: 1 }]);
});

test("goal milestones are quarter marks of the target, with what is left to the next", () => {
  const goal = (over: Partial<Goal>): Goal => ({
    id: "g", userId: "u", name: "Goal", targetCents: 1_000_000, currentCents: 0, targetDate: "2029-01-01", priorityRank: 1,
    flexibility: "flexible", linkedAccountId: null, ...over,
  });
  const [half, none, done, over] = goalMilestones([
    goal({ id: "a", currentCents: 520_000 }),
    goal({ id: "b", currentCents: 0 }),
    goal({ id: "c", currentCents: 1_000_000 }),
    goal({ id: "d", currentCents: 1_200_000 }),
  ]);
  assert.deepEqual(half!.milestones.map((m) => [m.share, m.cents, m.reached]), [[0.25, 250_000, true], [0.5, 500_000, true], [0.75, 750_000, false]]);
  assert.deepEqual(half!.next, { share: 0.75, remainingCents: 230_000 });
  assert.equal(half!.progress, 0.52);
  assert.deepEqual(none!.next, { share: 0.25, remainingCents: 250_000 });
  assert.equal(done!.next, null);
  assert.equal(over!.progress, 1); // held at 1
});

test("the next payday follows the days of the month paychecks landed on", () => {
  const paychecks = [
    { date: "2026-10-01", amountCents: 285_000 },
    { date: "2026-10-15", amountCents: 285_000 },
    { date: "2026-11-01", amountCents: 285_000 },
    { date: "2026-11-15", amountCents: 285_000 },
  ];
  assert.deepEqual(nextPayday(paychecks, "2026-11-20"), { date: "2026-12-01", expectedCents: 285_000, daysAway: 11 });
  assert.deepEqual(nextPayday(paychecks, "2026-11-01"), { date: "2026-11-15", expectedCents: 285_000, daysAway: 14 }); // today does not count
  assert.deepEqual(nextPayday(paychecks, "2026-11-30"), { date: "2026-12-01", expectedCents: 285_000, daysAway: 1 });
  // A payday on the 31st lands on the last day of a short month.
  assert.deepEqual(nextPayday([{ date: "2026-10-31", amountCents: 100_000 }], "2026-11-10"), { date: "2026-11-30", expectedCents: 100_000, daysAway: 20 });
  // Old paychecks do not make a pattern.
  assert.equal(nextPayday([{ date: "2026-01-01", amountCents: 285_000 }], "2026-11-20"), null);
  assert.equal(nextPayday([], "2026-11-20"), null);
});
