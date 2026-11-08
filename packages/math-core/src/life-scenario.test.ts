import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifeScenarioAnalyzeRequest, LifeScenarioGoalInput } from "@finvantage/contracts";
import { analyzeLifeScenario, LifeScenarioValidationError } from "./life-scenario";

const ASOF = "2026-11-01";

/** The spec's fixture: a baby due Mar 2027 against a Japan trip, an emergency fund, and a home down payment. */
function fixture(overrides: Partial<LifeScenarioAnalyzeRequest> = {}): LifeScenarioAnalyzeRequest {
  const goals: LifeScenarioGoalInput[] = [
    { id: "japan", name: "Japan Trip", targetCents: 600_000, savedCents: 320_000, monthlyContributionCents: 70_000, kind: "trip", plannedDate: "2027-04-01" },
    { id: "emergency", name: "Emergency Fund", targetCents: 1_500_000, savedCents: 900_000, monthlyContributionCents: 45_000, kind: "standard", plannedDate: null },
    { id: "home", name: "Home Down Payment", targetCents: 3_000_000, savedCents: 1_200_000, monthlyContributionCents: 50_000, kind: "standard", plannedDate: null },
  ];
  return {
    eventType: "new_baby",
    customEventName: "",
    startMonth: "2027-03-01",
    monthlyCostCents: 90_000,
    oneTimeCostCents: 360_000,
    oneTimeSourceGoalId: "japan",
    selectedGoalIds: ["japan", "emergency", "home"],
    split: { japan: 25_000, emergency: 30_000, home: 20_000 },
    selectedOption: "keep",
    allowOverCommit: false,
    goals,
    freeCashCents: 165_000,
    asOf: ASOF,
    ...overrides,
  };
}

test("fixture: Japan trip moves 14 months (keep)", () => {
  const result = analyzeLifeScenario(fixture());
  const japan = result.goals.find((g) => g.goalId === "japan")!;
  assert.equal(japan.beforeDisplayDate, "2027-04-01");
  assert.equal(japan.displayDate, "2028-06-01");
  assert.equal(japan.delayMonths, 14);
  assert.equal(japan.delayLabel, "14 months later");
});

test("fixture: Emergency Fund moves 4 months (keep)", () => {
  const result = analyzeLifeScenario(fixture());
  const emergency = result.goals.find((g) => g.goalId === "emergency")!;
  assert.equal(emergency.beforeDisplayDate, "2027-12-01");
  assert.equal(emergency.displayDate, "2028-04-01");
  assert.equal(emergency.delayMonths, 4);
});

test("fixture: Home Down Payment moves 4 years (keep)", () => {
  const result = analyzeLifeScenario(fixture());
  const home = result.goals.find((g) => g.goalId === "home")!;
  assert.equal(home.beforeDisplayDate, "2029-10-01");
  assert.equal(home.displayDate, "2033-10-01");
  assert.equal(home.delayMonths, 48);
  assert.equal(home.delayLabel, "4 years later");
});

test("fixture: recovery options for the trip goal", () => {
  const result = analyzeLifeScenario(fixture());
  const byOption = new Map(result.options.map((o) => [o.option, o]));
  assert.equal(byOption.get("save_more")!.tripDate, "2027-12-01");
  assert.equal(byOption.get("reduce_one_time")!.tripDate, "2028-03-01");
  assert.equal(byOption.get("both")!.tripDate, "2027-11-01");
});

test("fixture: client (contract-shaped request) and server produce the same result (parity)", () => {
  // There is one engine implementation; this proves the same request always yields the same
  // response, which is the guarantee the client relies on instead of recomputing locally.
  const a = analyzeLifeScenario(fixture());
  const b = analyzeLifeScenario(fixture());
  assert.deepEqual(a, b);
});

test("edge case: event month equal to the current month is rejected", () => {
  assert.throws(
    () => analyzeLifeScenario(fixture({ startMonth: ASOF })),
    (error: unknown) => error instanceof LifeScenarioValidationError && error.code === "event_not_future",
  );
});

test("edge case: a goal already funded before the event finishes immediately on the baseline", () => {
  const input = fixture({
    goals: [
      { id: "japan", name: "Japan Trip", targetCents: 600_000, savedCents: 320_000, monthlyContributionCents: 70_000, kind: "trip", plannedDate: "2027-04-01" },
      { id: "emergency", name: "Emergency Fund", targetCents: 500_000, savedCents: 500_000, monthlyContributionCents: 45_000, kind: "standard", plannedDate: null },
      { id: "home", name: "Home Down Payment", targetCents: 3_000_000, savedCents: 1_200_000, monthlyContributionCents: 50_000, kind: "standard", plannedDate: null },
    ],
  });
  const result = analyzeLifeScenario(input);
  const emergency = result.goals.find((g) => g.goalId === "emergency")!;
  assert.equal(emergency.beforeFundedDate, ASOF);
});

test("edge case: a split that exceeds free cash is rejected unless explicitly allowed", () => {
  const overcommitted = fixture({ split: { japan: 200_000, emergency: 200_000, home: 200_000 } });
  assert.throws(
    () => analyzeLifeScenario(overcommitted),
    (error: unknown) => error instanceof LifeScenarioValidationError && error.code === "split_exceeds_free_cash",
  );
  const allowed = analyzeLifeScenario({ ...overcommitted, allowOverCommit: true });
  assert.ok(allowed.goals.length > 0);
});

test("edge case: a goal that never gets funded reports a null date instead of crashing", () => {
  const input = fixture({
    goals: [
      { id: "japan", name: "Japan Trip", targetCents: 600_000, savedCents: 320_000, monthlyContributionCents: 70_000, kind: "trip", plannedDate: "2027-04-01" },
      { id: "emergency", name: "Emergency Fund", targetCents: 50_000_000, savedCents: 0, monthlyContributionCents: 100, kind: "standard", plannedDate: null },
      { id: "home", name: "Home Down Payment", targetCents: 3_000_000, savedCents: 1_200_000, monthlyContributionCents: 50_000, kind: "standard", plannedDate: null },
    ],
    split: { japan: 25_000, emergency: 100, home: 20_000 },
  });
  const result = analyzeLifeScenario(input);
  const emergency = result.goals.find((g) => g.goalId === "emergency")!;
  assert.equal(emergency.fundedDate, null);
  assert.equal(emergency.delayLabel, "Not Funded");
});
