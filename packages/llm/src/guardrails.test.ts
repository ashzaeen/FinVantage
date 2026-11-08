import assert from "node:assert/strict";
import { test } from "node:test";
import type { CopilotContext, CopilotMetrics } from "@finvantage/contracts";
import { CARD_JARGON, generateCopilotCard, templateCard } from "./copilot-card";
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
  transfer: null,
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
  assert.deepEqual(card.lead, { label: "Japan trip", value: "At risk (was on track)" });
  assert.deepEqual(card.keyFigures[0], { label: "Chance you reach your Japan trip", value: "93–94% → 76–77%" });
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

// The live MacBook Pro case, 2026-11-07: $3,699 against $3,400 in checking, Japan trip out of reach.
const pricey: CopilotContext = { ...context, priceCents: 369_900 };
const outOfReach: CopilotMetrics = {
  ...metrics,
  liquidBufferAfterCents: -29_900,
  headline: { ...metrics.headline, kind: "out_of_reach", statusAfter: "out of reach", oddsAfterLow: 0.04, oddsAfterHigh: 0.05 },
};

test("how far under the cushion is a math figure, so a model never has to subtract it", async () => {
  // $3,400 - $1,499 = $1,901 left, $599 under the $2,500 cushion.
  const underBy: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({
        impact: "This laptop puts your Japan trip at risk.",
        tradeOff: "You'd have $1,901 in checking, $599 under your $2,500 safety cushion.",
        smartMove: "Waiting until payday keeps your safety cushion whole.",
      }),
  };
  // No split plan, so $599 can only be allowed by the under-cushion figure.
  const noSplit = { ...metrics, liquidBufferAfterCents: 190_100, splitPlan: null };
  assert.equal((await generateCopilotCard(underBy, context, noSplit)).source, "llm");
  // Any other subtraction is still rejected.
  const wrong: LlmClient = { ...underBy, generate: async (request) => (await underBy.generate(request)).replace("$599 under", "$600 under") };
  assert.equal((await generateCopilotCard(wrong, context, noSplit)).source, "template");
});

test("short in checking but with spare savings: the card says to move money in first", () => {
  const card = templateCard({ ...context, priceCents: 149_900 }, {
    ...metrics,
    verdict: "good",
    headline: { ...metrics.headline, kind: "none", goalName: null, statusBefore: null, statusAfter: null },
    liquidBufferAfterCents: -139_900,
    splitPlan: null,
    transfer: { fromAccountName: "Plaid Money Market", amountCents: 389_900 },
  });
  assert.match(card.tradeOff, /Checking alone is \$1,399 short, but you have savings/);
  assert.match(card.smartMove, /Move \$3,899 from your Plaid Money Market to checking first/);
  assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS);
});

test("checking already under the cushion: cards don't mention the cushion or a blank amount", () => {
  // $100 in checking against a $2,500 cushion, like Plaid Sandbox's user.
  const under = { ...metrics, verdict: "good" as const, headline: { ...metrics.headline, kind: "none" as const, goalName: null, statusBefore: null, statusAfter: null }, splitPlan: null };
  const cord = templateCard({ ...context, priceCents: 1_299 }, { ...under, liquidBufferAfterCents: 8_701, transfer: null });
  const laptopShort = templateCard(context, { ...under, liquidBufferAfterCents: -139_900, transfer: { fromAccountName: "Plaid Money Market", amountCents: 139_900 } });
  for (const card of [cord, laptopShort]) {
    const text = cardText(card) + card.keyFigures.map((k) => `${k.label} ${k.value}`).join(" ");
    assert.doesNotMatch(text, /undefined|cushion|2,500|2,412/, text);
  }
  assert.match(laptopShort.smartMove, /Move \$1,399 from your Plaid Money Market to checking first, so checking covers it/);
  // The available balance the math used ($100), so it can be matched to the bank's figures.
  assert.deepEqual(laptopShort.keyFigures[0], { label: "Available in checking", value: "$100" });
  assert.deepEqual(cord.keyFigures[0], { label: "Available in checking", value: "$100" });
});

test("a purchase bigger than checking says how short, never a negative balance", () => {
  const card = templateCard(pricey, outOfReach);
  assert.match(card.tradeOff, /you'd be \$299 short/);
  assert.doesNotMatch(cardText(card) + card.keyFigures.map((k) => k.value).join(" "), /-\s?\$/);
  assert.ok(card.keyFigures.some((k) => k.label === "Short in checking" && k.value === "$299"));
});

test("a goal that was already unlikely and only slips a little still gets the 0% split", () => {
  const slip: CopilotMetrics = {
    ...metrics,
    headline: { ...metrics.headline, kind: "delay", delayMonths: 0.5, statusBefore: "unlikely", statusAfter: "unlikely" },
  };
  assert.match(templateCard(context, slip).smartMove, /0% Promo Card/);
});

test("when a goal falls out of reach, no card suggests financing it", async () => {
  assert.doesNotMatch(templateCard(pricey, outOfReach).smartMove, /Promo Card|\$2,799/);
  // A model that tries the split anyway is rejected: those figures and the card name were never offered.
  const financing: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({
        impact: "This purchase puts your Japan trip out of reach.",
        tradeOff: "You'd be $299 short in checking.",
        smartMove: "Pay $900 now and put $2,799 on your 0% Promo Card.",
      }),
  };
  assert.equal((await generateCopilotCard(financing, pricey, outOfReach)).source, "template");
  const negative: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({ impact: "This purchase puts your Japan trip out of reach.", tradeOff: "Checking would be -$299.", smartMove: "Wait a few months." }),
  };
  assert.equal((await generateCopilotCard(negative, pricey, outOfReach)).source, "template");
});

test("a model card that uses finance jargon falls back to the plain template", async () => {
  const jargony: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({
        impact: "This laptop puts your Japan trip at risk.",
        tradeOff: "Paying $1,499 leaves $1,901, below your $2,500 buffer.",
        smartMove: "Put $599 on your 0% Promo Card at $60/month instead.",
      }),
  };
  assert.equal((await generateCopilotCard(jargony, context, metrics)).source, "template");
});

test("the same inputs reuse an accepted LLM card without calling the model again", async () => {
  let calls = 0;
  const counting: LlmClient = {
    provider: "test",
    generate: async () => {
      calls += 1;
      return JSON.stringify({
        impact: "This laptop puts your Japan trip at risk.",
        tradeOff: "Paying $1,499 leaves $1,800 in checking.",
        smartMove: "Put $599 on your 0% Promo Card at $60/month instead.",
      });
    },
  };
  const first = await generateCopilotCard(counting, context, metrics);
  const second = await generateCopilotCard(counting, context, metrics);
  assert.equal(calls, 1);
  assert.equal(second.source, "llm");
  assert.deepEqual(second, first);
});

test("a rejected or failed card is not reused, so the next request asks the model again", async () => {
  let calls = 0;
  const flaky: LlmClient = {
    provider: "test",
    generate: async () => {
      calls += 1;
      if (calls === 1) throw new Error("rate limited");
      return JSON.stringify({ impact: "This laptop puts your Japan trip at risk.", tradeOff: "x", smartMove: "y" });
    },
  };
  assert.equal((await generateCopilotCard(flaky, context, metrics)).source, "template");
  assert.equal((await generateCopilotCard(flaky, context, metrics)).source, "llm");
  assert.equal(calls, 2);
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

test("cards use plain words: no finance jargon, and \"likely\" never reads as good news on a warning", () => {
  const jargon = CARD_JARGON;
  const rental: CopilotContext = { pageType: "rental", itemType: "rent_monthly", priceCents: 195_000, merchant: "x" };
  const car: CopilotContext = { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 2_800_000, merchant: "x" };
  const likely: CopilotMetrics = { ...metrics, headline: { ...metrics.headline, statusAfter: "likely" } };
  const cards = [
    templateCard(context, metrics),
    templateCard(context, likely),
    templateCard(rental, { ...metrics, splitPlan: null, fixedCostRatioBefore: 0.42, fixedCostRatioAfter: 0.66, safeRentThresholdCents: 120_000 }),
    templateCard(car, { ...metrics, splitPlan: null, debtToIncomeBefore: 0.16, debtToIncomeAfter: 0.25, totalCostOfOwnershipCents: 3_326_400, vehicle: { termMonths: 60, annualRate: 0.07, monthlyPaymentCents: 55_440, totalInterestCents: 526_400 } }),
  ];
  for (const card of cards) {
    const text = [cardText(card), card.lead?.label, card.lead?.value, ...card.keyFigures.map((k) => k.label)].join(" ");
    assert.doesNotMatch(text, jargon, text);
  }
  assert.deepEqual(templateCard(context, likely).lead, { label: "Japan trip", value: "Probably OK (was on track)" });
});

const none = { ...metrics.headline, kind: "none" as const, goalName: null, oddsBeforeLow: null, oddsBeforeHigh: null, oddsAfterLow: null, oddsAfterHigh: null, statusBefore: null, statusAfter: null };

test("an affordable purchase is affirmed and steered away from card debt", () => {
  const small: CopilotContext = { ...context, priceCents: 12_900 };
  const card = templateCard(small, { ...metrics, verdict: "good", headline: none, splitPlan: null, liquidBufferAfterCents: 327_100 });
  assert.match(card.impact, /fits your plan/);
  assert.match(card.tradeOff, /more than your \$2,500 safety cushion/);
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
  assert.match(card.tradeOff, /guaranteed 23% return, more than investing \(7%\) or a savings account \(4%\)/);
  assert.match(card.smartMove, /\$35 you were paying each month/);
  assert.deepEqual(card.lead, { label: "Interest saved", value: "$198 a year" });
  assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS);
});

test("when a goal becomes unlikely, the card steers to a cheaper option, not financing", () => {
  const big: CopilotContext = { ...context, priceCents: 329_900 };
  const card = templateCard(big, { ...metrics, headline: { ...metrics.headline, statusAfter: "unlikely" } });
  assert.match(card.smartMove, /cheaper option, or waiting/);
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
  assert.equal(card.impact, "Paying only the minimum leaves $825 on your Cash Rewards Card, still charging 23% interest.");
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
  const card = await generateCopilotCard(new GeminiClient("k", { flash: "f" }, fake), context, metrics);
  assert.equal(card.source, "llm");
  assert.equal(card.impact, "This laptop puts your Japan trip at risk.");
});
