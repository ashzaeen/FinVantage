import assert from "node:assert/strict";
import { test } from "node:test";
import type { CopilotContext, CopilotMetrics } from "@finvantage/contracts";
import { generateCopilotCard, templateCard } from "./copilot-card";
import { cardText, validateCard, wordCount, MAX_CARD_WORDS } from "./guardrails";
import type { LlmClient } from "./client";

const context: CopilotContext = {
  pageType: "checkout",
  itemType: "retail_purchase",
  priceCents: 149_900,
  merchant: "Demo Electronics",
};

const metrics: CopilotMetrics = {
  fixedCostRatioBefore: null,
  fixedCostRatioAfter: null,
  debtToIncomeBefore: null,
  debtToIncomeAfter: null,
  runwayDaysBefore: 60,
  runwayDaysAfter: 45,
  liquidBufferAfterCents: 180_000,
  bufferTargetCents: 250_000,
  daysUntilPayday: 8,
  safeRentThresholdCents: null,
  totalCostOfOwnershipCents: null,
  opportunityCostCents: 145_000,
  opportunityHorizonYears: 10,
  goalImpacts: [],
};

test("a card with an invented figure is rejected", () => {
  const card = { impact: "You will lose $9,999.", tradeOff: "x", smartMove: "y" };
  assert.equal(validateCard(card, ["$1,800"]).ok, false);
});

test("a card using only provided figures passes", () => {
  const card = { impact: "Checking falls to $1,800.", tradeOff: "x", smartMove: "y" };
  assert.equal(validateCard(card, ["$1,800"]).ok, true);
});

test("the template card stays inside the word cap", () => {
  assert.ok(wordCount(cardText(templateCard(context, metrics))) <= MAX_CARD_WORDS);
});

test("an LLM failure falls back to the template card", async () => {
  const failing: LlmClient = {
    provider: "test",
    generate: async () => {
      throw new Error("down");
    },
  };
  const card = await generateCopilotCard(failing, context, metrics);
  assert.equal(card.source, "template");
});

test("an LLM card that alters a figure falls back to the template card", async () => {
  const lying: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({ impact: "Checking drops to $5.", tradeOff: "x", smartMove: "y" }),
  };
  const card = await generateCopilotCard(lying, context, metrics);
  assert.equal(card.source, "template");
});
