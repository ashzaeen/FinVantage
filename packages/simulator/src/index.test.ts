import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifeEvent, SimulationInputs } from "@finvantage/contracts";
import { evaluatePurchase, forecastCash, projectRetirement, simulate } from "./index";

const inputs: SimulationInputs = {
  snapshot: {
    asOf: "2026-11-07",
    accounts: [],
    monthlyIncomeCents: 600_000,
    monthlyFixedCostsCents: 250_000,
    monthlyDebtPaymentsCents: 80_000,
    monthlySpendingCents: 400_000,
    monthlySavingsCents: 100_000,
    nextPaydayOn: "2026-11-15",
    bufferTargetCents: 250_000,
  },
  goals: [
    {
      id: "g1",
      userId: "u1",
      name: "House",
      targetCents: 6_000_000,
      currentCents: 1_000_000,
      targetDate: "2030-11-01",
      priorityRank: 1,
      flexibility: "flexible",
      linkedAccountId: null,
    },
  ],
  lifeEvents: [],
  whatIf: null,
};

const housePurchase: LifeEvent = {
  id: "e1",
  userId: "u1",
  type: "house_purchase",
  date: "2027-06-01",
  recurrence: "one_time",
  dollarImpactCents: -800_000,
  durationMonths: null,
  linkedGoalId: "g1",
  source: "form",
};

test("same seed and inputs give the same result", () => {
  assert.deepEqual(simulate(inputs, { seed: 7 }), simulate(inputs, { seed: 7 }));
});

// PRD section 5 acceptance criteria. These must keep passing on the real engine.
test("a house purchase event lowers the goal probability range", () => {
  const before = simulate(inputs).goalOutcomes[0]!;
  const after = simulate({ ...inputs, lifeEvents: [housePurchase] }).goalOutcomes[0]!;
  assert.ok(after.probabilityHigh < before.probabilityHigh);
});

test("the fan chart widens over time", () => {
  const fan = simulate(inputs).goalOutcomes[0]!.fan;
  const width = (i: number) => fan[i]!.p90Cents - fan[i]!.p10Cents;
  assert.ok(width(fan.length - 1) > width(1));
});

// Engine behavior beyond the PRD acceptance criteria.

const twoGoals: SimulationInputs = {
  ...inputs,
  goals: [
    { ...inputs.goals[0]!, id: "g1", priorityRank: 1 },
    {
      id: "g2",
      userId: "u1",
      name: "Trip",
      targetCents: 400_000,
      currentCents: 0,
      targetDate: "2027-08-01",
      priorityRank: 2,
      flexibility: "flexible",
      linkedAccountId: null,
    },
  ],
};

test("different seeds give different results", () => {
  const a = simulate(inputs, { seed: 1 }).goalOutcomes[0]!.fan;
  const b = simulate(inputs, { seed: 2 }).goalOutcomes[0]!.fan;
  assert.notDeepEqual(a, b);
});

test("goals compete for the same dollars", () => {
  const alone = simulate({ ...twoGoals, goals: [twoGoals.goals[1]!] }).goalOutcomes[0]!;
  const sharing = simulate(twoGoals).goalOutcomes.find((o) => o.goalId === "g2")!;
  assert.ok(sharing.probabilityHigh <= alone.probabilityHigh);
  assert.ok(sharing.medianCompletionDate! >= alone.medianCompletionDate!);
});

test("a one-time purchase delays goals", () => {
  const impacts = evaluatePurchase(twoGoals, { amountCents: 150_000, monthlyCents: 0 });
  assert.ok(impacts.some((i) => (i.delayMonths ?? 0) > 0));
  assert.ok(impacts.every((i) => (i.delayMonths ?? 0) >= 0));
});

test("a monthly cost lowers probability more than nothing", () => {
  const impacts = evaluatePurchase(twoGoals, { amountCents: 0, monthlyCents: 50_000 });
  const house = impacts.find((i) => i.goalId === "g1")!;
  assert.ok(house.probabilityHighDelta < 0);
});

test("no purchase means no change", () => {
  const impacts = evaluatePurchase(twoGoals, { amountCents: 0, monthlyCents: 0 });
  for (const i of impacts) {
    assert.equal(i.delayMonths, 0);
    assert.equal(i.probabilityLowDelta, 0);
  }
});

test("shifting an event later changes the outcome", () => {
  const withEvent = { ...inputs, lifeEvents: [housePurchase] };
  const shifted = { ...withEvent, whatIf: { monthlySavingsDeltaCents: 0, purchaseAmountCents: 0, eventShifts: [{ lifeEventId: "e1", shiftMonths: 24 }] } };
  assert.notDeepEqual(simulate(withEvent).goalOutcomes[0], simulate(shifted).goalOutcomes[0]);
});

test("probability range is ordered and within 0 to 1", () => {
  for (const o of simulate(twoGoals).goalOutcomes) {
    assert.ok(o.probabilityLow >= 0 && o.probabilityHigh <= 1);
    assert.ok(o.probabilityLow <= o.probabilityHigh);
  }
});

test("benchmark: Copilot evaluation at 5,000 paths with three goals is under 2 seconds", () => {
  const three = {
    ...twoGoals,
    goals: [...twoGoals.goals, { ...twoGoals.goals[1]!, id: "g3", name: "Car", priorityRank: 3, targetCents: 1_200_000, targetDate: "2029-01-01" }],
  };
  const start = performance.now();
  evaluatePurchase(three, { amountCents: 149_900, monthlyCents: 0 }, { paths: 5_000 });
  const ms = performance.now() - start;
  assert.ok(ms < 2_000, `took ${Math.round(ms)} ms`);
});

test("the cash forecast covers 24 months, is a widening range, and repeats for the same seed", () => {
  const a = forecastCash(inputs, { seed: 7, paths: 600 });
  const b = forecastCash(inputs, { seed: 7, paths: 600 });
  assert.deepEqual(a, b);
  assert.equal(a.months.length, 24);
  for (const m of a.months) assert.ok(m.p10Cents <= m.p50Cents && m.p50Cents <= m.p90Cents);
  // With no life events the middle month is about the monthly savings.
  assert.ok(Math.abs(a.months[0]!.p50Cents - inputs.snapshot.monthlySavingsCents) < 40_000);
});

test("a monthly life event lowers the cash forecast from its start month", () => {
  const rent: LifeEvent = { ...housePurchase, id: "rent", recurrence: "recurring", dollarImpactCents: -50_000, durationMonths: null, date: "2027-03-01" };
  const base = forecastCash(inputs, { seed: 7, paths: 600 });
  const withRent = forecastCash({ ...inputs, lifeEvents: [rent] }, { seed: 7, paths: 600 });
  assert.equal(withRent.months[0]!.p50Cents, base.months[0]!.p50Cents, "before the event nothing changes");
  assert.ok(withRent.months[10]!.p50Cents < base.months[10]!.p50Cents - 40_000);
});

test("the retirement fan grows with contributions, widens with time, and repeats for the same seed", () => {
  const input = { asOf: "2026-11-07", startingCents: 5_000_000, monthlyContributionCents: 50_000, years: 30 };
  const a = projectRetirement(input, { seed: 3, paths: 800 });
  assert.deepEqual(a, projectRetirement(input, { seed: 3, paths: 800 }));
  assert.equal(a.points.length, 31);
  assert.equal(a.points[0]!.p50Cents, 5_000_000);
  const last = a.points.at(-1)!;
  assert.ok(last.p10Cents < last.p50Cents && last.p50Cents < last.p90Cents);
  assert.ok(last.p50Cents > 5_000_000 + 30 * 12 * 50_000, "growth adds to what was put in");
  const early = a.points[5]!;
  assert.ok(last.p90Cents - last.p10Cents > early.p90Cents - early.p10Cents);
  const more = projectRetirement({ ...input, monthlyContributionCents: 100_000 }, { seed: 3, paths: 800 });
  assert.ok(more.points.at(-1)!.p50Cents > last.p50Cents);
});
