import assert from "node:assert/strict";
import { test } from "node:test";
import type { CopilotContext, CopilotMetrics } from "@finvantage/contracts";
import { CARD_JARGON, generateCopilotCard, templateCard } from "./copilot-card";
import { cardText, contradictsVerdict, isGroundedNumber, moneyIn, withoutNames, withoutSentences, groundedFigures, validateCard, validateGrounded, validateNumbers, wordCount, wordsToNumber, MAX_CARD_WORDS, MAX_CHAT_WORDS } from "./guardrails";
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
  purchaseSize: null,
  payFirst: null,
  rentIncomeShare: null,
  rentGuidelineCents: null,
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

test("a big but affordable purchase: worth a look, with the debt to pay first", () => {
  // Plaid Sandbox's $4,799 MacBook Pro for a person carrying a 12.5% card balance.
  const card = templateCard({ ...context, priceCents: 479_900 }, {
    ...metrics,
    verdict: "neutral",
    headline: { ...metrics.headline, kind: "none", goalName: null, statusBefore: null, statusAfter: null },
    liquidBufferAfterCents: -469_900,
    splitPlan: null,
    transfer: { fromAccountName: "Plaid Money Market", amountCents: 469_900 },
    purchaseSize: { monthlyIncomeShare: 0.774, spareCashShare: 0.135, big: true, nonMortgageDebtCents: 41_000, heavyDebt: false, stretch: false },
    payFirst: { accountName: "Plaid Credit Card", balanceCents: 41_000, annualRate: 0.125 },
  });
  assert.equal(card.impact, "You can afford this, but it's a big purchase for you.");
  assert.equal(card.tradeOff, "It's 77% of a month's income and 14% of your spare savings.");
  assert.match(card.smartMove, /Pay off your Plaid Credit Card \(\$410 at 12.5%\) first.*Then move \$4,699 from your Plaid Money Market/);
  assert.deepEqual(card.lead, { label: "Big purchase", value: "77% of monthly income" });
  assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS);
});

test("a big purchase while deep in debt reads as a stretch, not an invitation", () => {
  // The live $5,399 MacBook Pro for Plaid Sandbox's user, about $93,900 in debt outside the mortgage.
  const card = templateCard({ ...context, priceCents: 539_900 }, {
    ...metrics,
    verdict: "caution",
    headline: { ...metrics.headline, kind: "none", goalName: null, statusBefore: null, statusAfter: null },
    liquidBufferAfterCents: -529_900,
    splitPlan: null,
    transfer: { fromAccountName: "Plaid Money Market", amountCents: 529_900 },
    purchaseSize: { monthlyIncomeShare: 0.871, spareCashShare: 0.152, big: true, nonMortgageDebtCents: 9_390_000, heavyDebt: true, stretch: true },
    payFirst: { accountName: "Plaid Credit Card", balanceCents: 41_000, annualRate: 0.125 },
  });
  assert.equal(card.impact, "This is a big purchase while you're carrying a lot of debt.");
  assert.equal(card.tradeOff, "It's 87% of a month's income, and you owe $93,900 outside your mortgage.");
  assert.match(card.smartMove, /less expensive option, or paying off your Plaid Credit Card \(12\.5%\) first/);
  assert.deepEqual(card.lead, { label: "Big purchase", value: "87% of monthly income" });
  assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS);
});

test("rent over 30% of income that savings could absorb still gets the guideline", () => {
  const rental: CopilotContext = { pageType: "rental", itemType: "rent_monthly", priceCents: 195_000, merchant: "x" };
  const card = templateCard(rental, {
    ...metrics,
    verdict: "caution",
    headline: { ...metrics.headline, kind: "none", goalName: null, statusBefore: null, statusAfter: null },
    splitPlan: null,
    liquidBufferAfterCents: null,
    fixedCostRatioBefore: 0.3,
    fixedCostRatioAfter: 0.62,
    safeRentThresholdCents: 380_000,
    rentIncomeShare: 0.31,
    rentGuidelineCents: 185_000,
  });
  assert.equal(card.impact, "This rent is 31% of your income, above the common 30% limit.");
  assert.match(card.smartMove, /Rent around \$1,850 or less/);
});

test("a car loan past 36% of income says so and suggests a cheaper car", () => {
  const car: CopilotContext = { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 2_800_000, merchant: "x" };
  const card = templateCard(car, {
    ...metrics,
    verdict: "caution",
    headline: { ...metrics.headline, kind: "none", goalName: null, statusBefore: null, statusAfter: null },
    splitPlan: null,
    liquidBufferAfterCents: null,
    debtToIncomeBefore: 0.51,
    debtToIncomeAfter: 0.6,
    totalCostOfOwnershipCents: 3_330_000,
    vehicle: { termMonths: 60, annualRate: 0.07, monthlyPaymentCents: 55_500, totalInterestCents: 530_000 },
  });
  assert.equal(card.impact, "This loan would put 60% of your income toward debt, above the 36% lenders consider safe.");
  assert.match(card.smartMove, /cheaper car, or a bigger down payment/);
  assert.ok(wordCount(cardText(card)) <= MAX_CARD_WORDS);
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
  assert.match(card.smartMove, /Cash Rewards Card.*22\.99%/);
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
  assert.match(card.tradeOff, /guaranteed 22\.99% return, more than investing \(7%\) or a savings account \(4%\)/);
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
  assert.equal(card.impact, "Paying only the minimum leaves $825 on your Cash Rewards Card, still charging 22.99% interest.");
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

test("grounded figures cover cents as dollars, fractions as percents, and numbers in strings", () => {
  const allowed = groundedFigures({ balanceCents: 123450, probabilityLow: 0.62, label: "$2,500 target by 2027-03-01" });
  for (const ok of ["1234.5", "1234.50", "1234", "1235", "62", "2500", "2027"]) {
    assert.ok(allowed.has(String(Number(ok))), `${ok} should be allowed`);
  }
});

test("chat answers check dollar amounts only", () => {
  const allowed = groundedFigures({ spentCents: 45000, limitCents: 40000 });
  assert.deepEqual(validateGrounded("You spent $450 against a $400 limit, over 2 weeks.", allowed), { ok: true });
  const bad = validateGrounded("Cutting $175 a month would fix it.", allowed);
  assert.equal(bad.ok, false);
  assert.deepEqual(!bad.ok && bad.invented, ["$175"]);
  assert.equal(validateGrounded("word ".repeat(MAX_CHAT_WORDS + 1), allowed).ok, false);
});

test("general advice with plain numbers and percentages reads freely", () => {
  const allowed = groundedFigures({});
  const advice = "Keep your credit utilization under 30%. Payment history is about 35% of a FICO score, and a late payment can stay on your report for 7 years. Aim for 3 to 6 months of expenses in savings. The S&P 500 is one index; a 401(k) can hold it.";
  assert.deepEqual(validateGrounded(advice, allowed), { ok: true });
  assert.deepEqual(validateGrounded("Book by March 15, 2027, or you'd wait until 2150.", allowed), { ok: true });
});

test("rounded amounts pass; amounts nobody gave do not", () => {
  const allowed = groundedFigures({ monthlyPaymentCents: 56_883, totalInterestCents: 912_980, savingsCents: 1_250_000 });
  for (const ok of ["about $570 a month", "roughly $9.1k in interest", "$12,500 saved", "$12.5K saved", "around 569 dollars"]) {
    assert.deepEqual(validateGrounded(ok, allowed), { ok: true }, ok);
  }
  for (const bad of ["$600 a month", "$2027 on it", "2,027.50 dollars", "$1.2 million"]) {
    assert.equal(validateGrounded(bad, allowed).ok, false, bad);
  }
});

test("dollar amounts are read in every common form", () => {
  assert.deepEqual(moneyIn("$570, $9.1k, $1.2 million and 300 dollars").map((m) => m.dollars), [570, 9100, 1_200_000, 300]);
});

test("tool inputs stay exact: only numbers the model was given", () => {
  const allowed = groundedFigures({ priceCents: 2_800_000 });
  assert.equal(isGroundedNumber(28_000, allowed), true);
  assert.equal(isGroundedNumber(12, allowed), true, "small counts");
  assert.equal(isGroundedNumber(100, allowed), true);
  assert.equal(isGroundedNumber(27_500, allowed), false, "no rounding for inputs");
});

test("an answer can lose the sentences holding an unchecked amount and keep the rest", () => {
  const text = "A Roth IRA is taxed now and can be tax-free later. You could put $9,999 in this year. Either account can hold an index fund, and both reward starting early with steady contributions.";
  const kept = withoutSentences(text, ["$9,999"]);
  assert.ok(kept && !kept.includes("9,999") && kept.includes("Roth IRA") && kept.includes("index fund"));
  assert.equal(withoutSentences("Cut $180 a month.", ["$180"]), null, "too little left to show");
});

test("numbers inside well-known financial names are names, not figures", () => {
  const allowed = groundedFigures({ amountCents: 50_000 });
  assert.deepEqual(validateGrounded("The S&P 500 and the Nasdaq-100 both beat the Russell 2000; a 401(k) or a 529 plan can hold them.", allowed), { ok: true });
  assert.equal(validateGrounded("The S&P 500 returned $777.", allowed).ok, false, "a real figure beside a name is still checked");
  assert.equal(validateGrounded("Your payment is $56,883.", groundedFigures({ paymentCents: 56_883 })).ok, false, "cents never pass as dollars");
});


/* ─── Security review W2: the guardrails check meaning, not only digits ───── */

test("W2 G1: a spelled-out amount fails the card and report checks, while small counts pass", () => {
  const card = (impact: string) => validateCard({ impact, tradeOff: "", smartMove: "" }, ["$1,499"]);
  assert.equal(card("This laptop would cost you twenty-eight thousand dollars.").ok, false);
  assert.equal(card("It eats a hundred of your spare dollars.").ok, false);
  assert.equal(validateNumbers("Net worth grew by fifty thousand.", ["2026-Q3"]).ok, false, "reports share the check");
  assert.equal(card("Two goals slip, and twelve months of saving pays for it.").ok, true, "counts up to twelve are fine");
});

test("W2 G2: an approving card on a caution verdict falls back to the template", async () => {
  const approving = (): LlmClient => ({
    provider: "test",
    generate: async () =>
      JSON.stringify({
        impact: "Great choice: this fits your Japan trip perfectly.",
        tradeOff: "Nothing to worry about here.",
        smartMove: "Go ahead and buy it.",
      }),
  });
  assert.equal(metrics.verdict, "caution");
  assert.equal((await generateCopilotCard(approving(), context, metrics)).source, "template");
  // The same words are fine when the math says the purchase is good.
  assert.equal((await generateCopilotCard(approving(), context, { ...metrics, verdict: "good" })).source, "llm");
  assert.equal(contradictsVerdict("Great choice, go ahead.", "neutral"), null);
});

test("W2 G2: no template card trips its own tone check", () => {
  const rental: CopilotContext = { pageType: "rental", itemType: "rent_monthly", priceCents: 195_000, merchant: "x" };
  const car: CopilotContext = { pageType: "vehicle_financing", itemType: "vehicle", priceCents: 2_800_000, merchant: "x" };
  const noGoal = { ...metrics.headline, kind: "none" as const, goalName: null, statusBefore: null, statusAfter: null };
  const cases: Array<[CopilotContext, CopilotMetrics]> = [
    [context, metrics],
    [context, { ...metrics, splitPlan: null }],
    [context, { ...metrics, splitPlan: null, headline: noGoal }],
    [context, { ...metrics, liquidBufferAfterCents: -29_900, headline: { ...metrics.headline, kind: "out_of_reach", statusAfter: "out of reach" } }],
    [rental, { ...metrics, splitPlan: null, fixedCostRatioBefore: 0.42, fixedCostRatioAfter: 0.66, safeRentThresholdCents: 120_000 }],
    [car, { ...metrics, splitPlan: null, debtToIncomeBefore: 0.16, debtToIncomeAfter: 0.25, totalCostOfOwnershipCents: 3_326_400, vehicle: { termMonths: 60, annualRate: 0.07, monthlyPaymentCents: 55_440, totalInterestCents: 526_400 } }],
  ];
  for (const [c, m] of cases) {
    const text = cardText(templateCard(c, m));
    assert.equal(contradictsVerdict(text, "caution"), null, text);
  }
});

test("W2 G3: digits in a user-written name approve nothing outside that name", async () => {
  const names = ["Trip 2000", "0% Promo Card"];
  const card = (impact: string) => validateCard({ impact, tradeOff: "", smartMove: "" }, ["$1,499"], names);
  assert.equal(card("This puts $2,000 of your Trip 2000 goal at risk.").ok, false, "the name can't approve $2,000");
  assert.equal(card("This puts your Trip 2000 goal at risk.").ok, true, "the name itself is fine");
  assert.equal(card("Put the rest on your 0% promo card.").ok, true, "names match ignoring case");
  assert.equal(withoutNames("Your TRIP 2000 goal", ["Trip 2000"]).trim(), "Your   goal".trim());

  // End to end: a goal name with digits no longer launders an invented figure into a card.
  const inventing: LlmClient = {
    provider: "test",
    generate: async () =>
      JSON.stringify({ impact: "This puts $2,000 of your Trip 2000 goal at risk.", tradeOff: "x", smartMove: "y" }),
  };
  const poisoned: CopilotMetrics = { ...metrics, headline: { ...metrics.headline, goalName: "Trip 2000" } };
  assert.equal((await generateCopilotCard(inventing, context, poisoned)).source, "template");
});

test("W2 G4-G7: the chat check catches grand, bucks, k, USD, and spelled-out amounts", () => {
  const given = groundedFigures({ balanceCents: 340_000 });
  for (const text of [
    "You could afford a car up to 28 grand.",
    "That's about 500 bucks a month.",
    "You could afford a car up to 28k.",
    "You could afford a car up to USD 28,000.",
    "You could afford a car up to 28,000 USD.",
    "You could afford a car up to twenty-eight thousand dollars.",
    "Budget around twenty-eight grand for it.",
  ]) {
    assert.equal(validateGrounded(text, given).ok, false, text);
  }
  // The same forms pass when the amount is real.
  const real = groundedFigures({ priceCents: 2_800_000 });
  for (const text of ["Up to 28 grand.", "Up to 28k.", "Up to USD 28,000.", "Up to twenty-eight thousand dollars."]) {
    assert.equal(validateGrounded(text, real).ok, true, text);
  }
});

test("W2: the new money forms don't misread names, units, or counts", () => {
  const given = groundedFigures({ balanceCents: 340_000 });
  for (const text of [
    "Max out your 401k match first, then a 529 plan.",
    "A used car with 28k miles is a fair pick.",
    "An S&P 500 index fund is a common choice.",
    "Two of your goals stay on track.",
    "Your grand total of goals is on pace.",
  ]) {
    assert.equal(validateGrounded(text, given).ok, true, text);
  }
  assert.deepEqual(moneyIn("$28k").map((m) => m.dollars), [28_000], "$28k is counted once");
  assert.deepEqual(moneyIn("28k dollars").map((m) => m.dollars), [28_000], "28k dollars is counted once");
  assert.equal(wordsToNumber("twenty-eight thousand"), 28_000);
  assert.equal(wordsToNumber("one hundred and five"), 105);
  assert.equal(wordsToNumber("two million five hundred thousand"), 2_500_000);
  assert.equal(wordsToNumber("twenty bananas"), null);
});

/* ─── Security review N2: forms the second review got past the W2 fix ─────── */

test("N2: cards refuse look-alike digits, shorthand, a changed unit, and multiplier words", () => {
  const figures = ["$1,499", "$2,500", "2 days", "22.99%", "76-77%"];
  const card = (impact: string) => validateCard({ impact, tradeOff: "", smartMove: "" }, figures, ["Japan Trip"]);
  for (const text of [
    "This costs ２８,０００ of your Japan Trip savings.",
    "This costs $2k of your Japan Trip savings.",
    "Your Japan Trip odds fall by 1,499%.",
    "This costs $22.99 a month.",
    "This costs ten grand of your Japan Trip savings.",
    "This costs double your cushion.",
    "It takes half your Japan Trip savings.",
  ]) {
    assert.equal(card(text).ok, false, text);
  }
  // Real figures in their own units still pass, including a range written out.
  for (const text of [
    "Paying $1,499 leaves you under your $2,500 cushion for 2 days.",
    "Your Japan Trip odds fall to 76% to 77%, and the card charges 22.99%.",
    "This is a large purchase for you.",
  ]) {
    assert.equal(card(text).ok, true, text);
  }
});

test("N2: the tone check sees through punctuation and more ways of approving", () => {
  for (const text of [
    "You're good to buy this. It is affordable and a sensible purchase.",
    "This is not a risk to your Japan trip. Buy it today.",
    "Go, ahead: a great, choice.",
  ]) {
    assert.ok(contradictsVerdict(text, "caution"), text);
  }
  for (const text of [
    "If you planned for it, you can afford it.",
    "Buying this now puts your Japan trip at risk. A cheaper option is a safer choice.",
    "This purchase is a stretch. Consider waiting until payday.",
  ]) {
    assert.equal(contradictsVerdict(text, "caution"), null, text);
  }
});

test("N2: the chat check reads spaced thousands, look-alike digits, other currency signs, and bare thousands", () => {
  const given = groundedFigures({ balanceCents: 340_000 });
  for (const text of [
    "You could afford a car up to 28 000 dollars.",
    "You could afford a car up to $２８,０００.",
    "You could afford a car up to €28,000.",
    "You could afford a car up to 28 thousand.",
    "You could afford a car up to 28,000 in cash.",
  ]) {
    assert.equal(validateGrounded(text, given).ok, false, text);
  }
  for (const text of [
    "You have $3,400 in checking, about 3 400 dollars.",
    "A used car with 28 thousand miles is a fair pick.",
    "Over 10 years, 3 goals stay on track.",
    "Keep 3,400 in cash for emergencies.",
  ]) {
    assert.equal(validateGrounded(text, given).ok, true, text);
  }
});

test("R2-6: a short name can't delete digits, commas must group thousands, and money stays money", () => {
  const figures = ["$1,499", "$599", "$2,500", "22.99%", "10 months"];
  const card = (impact: string, names: string[] = ["Japan Trip"]) => validateCard({ impact, tradeOff: "", smartMove: "" }, figures, names);
  assert.equal(card("This costs $71,499 of your 7 goal.", ["7"]).ok, false, "C1");
  assert.equal(card("This costs $7,599 of your 7 goal.", ["7"]).ok, false, "C2");
  assert.equal(card("This costs $1,499k of your Japan Trip.").ok, false, "C3");
  assert.equal(card("This costs $2,500M of your Japan Trip.").ok, false, "C4");
  assert.equal(card("This costs 599 grand.").ok, false, "C5");
  assert.equal(card("This costs $14,99 of your Japan Trip.").ok, false, "C6");
  assert.equal(card("Your Japan Trip slips 599 months.").ok, false, "C8");
  // The name still works as a name, and real figures still pass.
  assert.equal(card("This puts your 7 goal at risk and costs $1,499.", ["7"]).ok, true);
  assert.equal(card("Pay $599 now over 10 months at 22.99% and keep $2,500.").ok, true);
  assert.equal(withoutNames("$71,499 of your 7 goal", ["7"]).includes("71,499"), true);
  assert.equal(validateGrounded("You could spend up to 28 K on the car.", groundedFigures({ balanceCents: 340_000 })).ok, false, "C13");
});
