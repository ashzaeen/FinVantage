import assert from "node:assert/strict";
import { test } from "node:test";
import type { CopilotMetrics } from "@finvantage/contracts";
import { toneFor } from "./overlay";

type ToneInput = Parameters<typeof toneFor>[0];

const headline: CopilotMetrics["headline"] = {
  kind: "odds",
  goalName: "Japan trip",
  delayMonths: null,
  oddsBeforeLow: 0.93,
  oddsBeforeHigh: 0.94,
  oddsAfterLow: 0.54,
  oddsAfterHigh: 0.55,
  statusBefore: "on track",
  statusAfter: "at risk",
} as CopilotMetrics["headline"];

const caution = (h: Partial<CopilotMetrics["headline"]>, liquidBufferAfterCents: number | null = 127_991): ToneInput => ({
  verdict: "caution",
  headline: { ...headline, ...h },
  liquidBufferAfterCents,
});

test("a goal at risk or worse is a red warning", () => {
  // The $2,120.09 gaming desktop on Amazon, 2026-11-07: Japan trip on track -> at risk.
  assert.equal(toneFor(caution({ statusAfter: "at risk" })), "danger");
  assert.equal(toneFor(caution({ statusAfter: "unlikely" })), "danger");
  assert.equal(toneFor(caution({ kind: "out_of_reach", statusAfter: "out of reach" })), "danger");
});

test("a purchase bigger than checking is a red warning", () => {
  assert.equal(toneFor(caution({ statusAfter: "likely" }, -29_900)), "danger");
});

test("a milder hit stays an amber heads-up", () => {
  assert.equal(toneFor(caution({ statusAfter: "likely" })), "warn");
  assert.equal(toneFor(caution({ kind: "delay", statusAfter: null, delayMonths: 0.8 })), "warn");
  assert.equal(toneFor(caution({ kind: "none", goalName: null, statusBefore: null, statusAfter: null })), "warn");
});

test("good and neutral keep their colors", () => {
  assert.equal(toneFor({ ...caution({}), verdict: "good" }), "ok");
  assert.equal(toneFor({ ...caution({}), verdict: "neutral" }), "info");
});
