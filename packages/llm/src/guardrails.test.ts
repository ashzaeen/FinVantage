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
  currentHousingCents: null,
  monthlyChangeCents: null,
  vehicle: null,
  splitPlan: {
    fromCheckingCents: 90_000,
    onPromoCardCents: 59_900,
    promoCardName: "0% Promo Card",
    monthlyPaymentCents: 6_000,
    payoffMonths: 10,
    promoEndsOn: "2027-09-30",
  },
  headline: {
    kind: "odds",
    goalName: "Japan trip",
    delayMonths: 0,
    oddsBeforeLow: 0.93,
    oddsBeforeHigh: 0.94,
    oddsAfterLow: 0.76,
    oddsAfterHigh: 0.77,
    statusBefore: "on track",
    statusAfter: "at risk",
  },
  verdict: "caution",
  debtPayment: null,
  alternatives: [
    { kind: "debt", label: "Cash Rewards Card", annualRate: 0.2299 },
    { kind: "invest", label: "Investing", annualRate: 0.07 },
    { kind: "savings", label: "High-Yield Savings", annualRate: 0.04 },
  ],
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

test("the template card leads with the headline goal", () => {
  const card = templateCard(context, metrics);
  assert.equal(card.impact, "This purchase puts your Japan trip at risk.");
  assert.deepEqual(card.lead, { label: "Japan trip", value: "On track → At risk" });
  assert.deepEqual(card.keyFigures[0], { label: "Chance", value: "93–94% → 76–77%" });
  assert.doesNotMatch(cardText(card), /odds/);
});

test("the checkout template offers the split plan", () => {
  assert.match(templateCard(context, metrics).smartMove, /\$900.*\$599.*\$60\/month/);
});

test("an LLM card that uses only given figures and names the goal is accepted", async () => {
  const good: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({
        impact: "This laptop puts your Japan trip at risk.",
        tradeOff: "Paying $1,499 leaves $1,800 in checking.",
        smartMove: "Put $599 on your 0% Promo Card at $60/month instead.",
      }),
  };
  const card = await generateCopilotCard(good, context, metrics);
  assert.equal(card.source, "llm");
});

test("an LLM card that skips the headline goal falls back", async () => {
  const vague: LlmClient = {
    provider: "test",
    generate: async () => JSON.stringify({ impact: "Big purchase!", tradeOff: "x", smartMove: "y" }),
  };
  assert.equal((await generateCopilotCard(vague, context, metrics)).source, "template");
});

test("every scenario template stays under the word cap", () => {
  const rental: CopilotContext = { pageType: "rental", itemType: "rent_monthly", priceCents: 195_000, merchant: "x" };
  const car: CopilotContext = { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 2_800_000, merchant: "x" };
  const rentalMetrics: CopilotMetrics = { ...metrics, liquidBufferAfterCents: null, splitPlan: null, fixedCostRatioBefore: 0.42, fixedCostRatioAfter: 0.66, safeRentThresholdCents: 120_000, headline: { ...metrics.headline, kind: "out_of_reach", goalName: "Emergency fund" } };
  const carMetrics: CopilotMetrics = { ...metrics, liquidBufferAfterCents: null, splitPlan: null, debtToIncomeBefore: 0.16, debtToIncomeAfter: 0.25, totalCostOfOwnershipCents: 3_326_400, vehicle: { termMonths: 60, annualRate: 0.07, monthlyPaymentCents: 55_440, totalInterestCents: 526_400 }, headline: { ...metrics.headline, kind: "delay", delayMonths: 4.2, goalName: "House down payment" } };
  for (const [c, m] of [[context, metrics], [rental, rentalMetrics], [car, carMetrics]] as const) {
    const card = templateCard(c, m);
    assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS, `${c.pageType}: ${wordCount(cardText(card))} words`);
  }
});

const none = { ...metrics.headline, kind: "none" as const, goalName: null, oddsBeforeLow: null, oddsBeforeHigh: null, oddsAfterLow: null, oddsAfterHigh: null, statusBefore: null, statusAfter: null };

test("an affordable purchase is affirmed and steered away from card debt", () => {
  const small: CopilotContext = { ...context, priceCents: 12_900 };
  const card = templateCard(small, { ...metrics, verdict: "good", headline: none, splitPlan: null, liquidBufferAfterCents: 327_100 });
  assert.match(card.impact, /fits your plan/);
  assert.match(card.tradeOff, /above your \$2,500 cushion/);
  assert.match(card.smartMove, /Cash Rewards Card.*23%/);
  assert.deepEqual(card.lead, { label: "Your goals", value: "On track" });
});

test("paying off a high-rate card is praised and compared to the alternatives", () => {
  const pay: CopilotContext = { pageType: "debt_payment", itemType: "credit_card_payment", priceCents: 86_000, merchant: "x" };
  const card = templateCard(pay, {
    ...metrics,
    verdict: "good",
    headline: none,
    splitPlan: null,
    liquidBufferAfterCents: null,
    debtPayment: {
      accountName: "Cash Rewards Card", annualRate: 0.2299, balanceCents: 86_000, paidCents: 86_000, paysOffInFull: true,
      annualInterestSavedCents: 19_800, freedMonthlyCents: 3_500, remainingCents: 0, checkingAfterCents: 254_000,
      isMinimumOnly: false, canPayInFull: true, remainingAnnualInterestCents: 0, fullAnnualInterestCents: 19_800,
    },
  });
  assert.match(card.impact, /Great move: paying off your Cash Rewards Card saves about \$198 a year/);
  assert.match(card.tradeOff, /23% guaranteed return, better than investing \(7%\) or savings \(4%\)/);
  assert.match(card.smartMove, /\$35 minimum/);
  assert.deepEqual(card.lead, { label: "Interest saved", value: "$198 a year" });
  assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS);
});

test("when a goal becomes unlikely, the card steers to a cheaper option, not financing", () => {
  const big: CopilotContext = { ...context, priceCents: 329_900 };
  const card = templateCard(big, { ...metrics, headline: { ...metrics.headline, statusAfter: "unlikely" } });
  assert.match(card.smartMove, /lower-priced option, or waiting/);
  assert.doesNotMatch(card.smartMove, /Promo Card/);
});

test("paying only the minimum nudges toward the full balance", () => {
  const pay: CopilotContext = { pageType: "debt_payment", itemType: "credit_card_payment", priceCents: 3_500, merchant: "x" };
  const card = templateCard(pay, {
    ...metrics,
    verdict: "neutral",
    headline: none,
    splitPlan: null,
    liquidBufferAfterCents: null,
    debtPayment: {
      accountName: "Cash Rewards Card", annualRate: 0.2299, balanceCents: 86_000, paidCents: 3_500, paysOffInFull: false,
      annualInterestSavedCents: 800, freedMonthlyCents: 0, remainingCents: 82_500, checkingAfterCents: 336_500,
      isMinimumOnly: true, canPayInFull: true, remainingAnnualInterestCents: 19_000, fullAnnualInterestCents: 19_800,
    },
  });
  assert.equal(card.impact, "Paying only the minimum keeps $825 on your Cash Rewards Card at 23%.");
  assert.match(card.smartMove, /full \$860 saves about \$198 a year/);
  assert.deepEqual(card.lead, { label: "Interest you'd still pay", value: "$190 a year" });
  assert.doesNotMatch(cardText(card), /Great move/);
});

test("a real-looking Gemini reply flows through to an LLM card", async () => {
  const { GeminiClient } = await import("./client");
  const reply = {
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      impact: "This laptop puts your Japan trip at risk.",
      tradeOff: "Paying $1,499 leaves $1,800 in checking, under your $2,500 cushion.",
      smartMove: "Put $599 on your 0% Promo Card at $60/month instead.",
    }) }] } }],
  };
  const fake = (async () => new Response(JSON.stringify(reply), { status: 200 })) as unknown as typeof fetch;
  const card = await generateCopilotCard(new GeminiClient("k", { flash: "f", pro: "p" }, fake), context, metrics);
  assert.equal(card.source, "llm");
  assert.equal(card.impact, "This laptop puts your Japan trip at risk.");
});
