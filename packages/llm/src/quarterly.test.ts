import assert from "node:assert/strict";
import { test } from "node:test";
import { ReportVisuals } from "@finvantage/contracts";
import type { LlmClient } from "./client";
import { generateQuarterlyReport, type QuarterlyReportInput } from "./quarterly";

const input: QuarterlyReportInput = {
  quarter: "2026-Q3",
  previousQuarter: "2026-Q2",
  evidence: [
    { quarter: "2026-Q2", label: "House probability range", value: "57% to 77%", sourceType: "simulation_run", sourceId: "run_q2", probabilityLow: 0.57, probabilityHigh: 0.77 },
    { quarter: "2026-Q3", label: "House probability range", value: "75% to 95%", sourceType: "simulation_run", sourceId: "run_q3", probabilityLow: 0.75, probabilityHigh: 0.95 },
  ],
  largestChange: {
    label: "House probability range",
    previousValue: "57% to 77%",
    currentValue: "75% to 95%",
    change: "The midpoint was 18 percentage points higher",
    cause: "The saved monthly savings scenario changed.",
  },
  visuals: ReportVisuals.parse({
    summary: { netWorthCents: 0, monthlyIncomeCents: 0, monthlySavingsCents: 0, monthlySpendingCents: 0 },
    accountAllocation: [],
    spendingTrend: [],
    goalComparisons: [],
    goalPathways: [],
  }),
  activity: { currentCopilotEvents: 0, previousCopilotEvents: 0, currentRecommendations: 0, previousRecommendations: 0 },
};

const writes = (why: string): LlmClient => ({
  provider: "fake",
  generate: async () =>
    JSON.stringify({
      wentWell: ["The House range moved from 57% to 77% in 2026-Q2 to 75% to 95% in 2026-Q3."],
      didNotGoWell: ["Nothing else stood out."],
      why,
      lookAhead: "Keep saving.",
      nextSteps: ["Review the plan."],
    }),
});

test("the cause can sit inside the model's own sentence", async () => {
  // Gemini writes the stored cause mid-sentence: lower-case first letter, no full stop.
  const result = await generateQuarterlyReport(writes("It rose because the saved monthly savings scenario changed, lifting the midpoint"), input);
  assert.equal(result.source, "llm");
});

test("a report that leaves out the cause still falls back", async () => {
  const result = await generateQuarterlyReport(writes("It rose because the user saved more"), input);
  assert.equal(result.source, "template");
});
