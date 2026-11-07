import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifeEvent, SimulationInputs } from "@finvantage/contracts";
import { simulate } from "./index";

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
