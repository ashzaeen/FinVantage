import {
  formatPercent,
  formatUsd,
  type CopilotCard,
  type CopilotContext,
  type CopilotMetrics,
} from "@finvantage/contracts";
import type { LlmClient } from "./client";
import { validateCard } from "./guardrails";

/*
 * Copilot card: goal first, then the trade-off, then a way out.
 *
 * Every number on a card is a formatted math-core figure from `cardFigures`. The template card
 * uses only those strings, and an LLM card is rejected unless every number it contains appears
 * in them (the math-first guardrail).
 */

type Headline = CopilotMetrics["headline"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 0.8 -> "3 weeks", 1 -> "1 month", 2.4 -> "2.4 months", 19.7 -> "20 months". */
export function formatDelay(months: number): string {
  if (months < 1) {
    const weeks = Math.max(1, Math.round(months * 4.35));
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  // One decimal is useful under 3 months; past that it reads as false precision.
  const rounded = months < 3 ? Math.round(months * 10) / 10 : Math.round(months);
  return rounded === 1 ? "1 month" : `${rounded} months`;
}

/** A probability range: "76-77%", or "93%" when both ends round the same. */
export function formatOdds(low: number, high: number): string {
  const a = Math.round(low * 100);
  const b = Math.round(high * 100);
  return a === b ? `${a}%` : `${a}–${b}%`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "On track → At risk", or "At risk" when the status word does not change. */
function statusChange(h: Headline): string | null {
  if (!h.statusBefore || !h.statusAfter) return null;
  return h.statusBefore === h.statusAfter ? cap(h.statusAfter) : `${cap(h.statusBefore)} → ${cap(h.statusAfter)}`;
}

function formatMonthYear(iso: string): string {
  const [year, month] = iso.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/** Every formatted figure a card may use, keyed by meaning. Built only from math-core output. */
export function cardFigures(context: CopilotContext, metrics: CopilotMetrics): Record<string, string> {
  const f: Record<string, string> = { price: formatUsd(context.priceCents) };
  const h = metrics.headline;
  if (h.delayMonths !== null && h.delayMonths > 0) f.goalDelay = formatDelay(h.delayMonths);
  if (h.oddsBeforeLow !== null && h.oddsBeforeHigh !== null) f.oddsBefore = formatOdds(h.oddsBeforeLow, h.oddsBeforeHigh);
  if (h.oddsAfterLow !== null && h.oddsAfterHigh !== null) f.oddsAfter = formatOdds(h.oddsAfterLow, h.oddsAfterHigh);

  if (metrics.fixedCostRatioBefore !== null) f.fixedCostsBefore = formatPercent(metrics.fixedCostRatioBefore);
  if (metrics.fixedCostRatioAfter !== null) f.fixedCostsAfter = formatPercent(metrics.fixedCostRatioAfter);
  if (metrics.debtToIncomeBefore !== null) f.debtToIncomeBefore = formatPercent(metrics.debtToIncomeBefore);
  if (metrics.debtToIncomeAfter !== null) f.debtToIncomeAfter = formatPercent(metrics.debtToIncomeAfter);
  if (metrics.liquidBufferAfterCents !== null) f.checkingAfter = formatUsd(metrics.liquidBufferAfterCents);
  f.bufferTarget = formatUsd(metrics.bufferTargetCents);
  if (metrics.daysUntilPayday !== null) f.daysToPayday = `${metrics.daysUntilPayday} days`;
  if (metrics.safeRentThresholdCents !== null) f.safeRent = formatUsd(metrics.safeRentThresholdCents);
  if (metrics.totalCostOfOwnershipCents !== null) f.totalCost = formatUsd(metrics.totalCostOfOwnershipCents);
  if (metrics.opportunityCostCents !== null && metrics.opportunityHorizonYears !== null) {
    f.opportunityCost = formatUsd(metrics.opportunityCostCents);
    f.opportunityYears = `${metrics.opportunityHorizonYears} years`;
  }
  if (metrics.vehicle) {
    f.vehicleRate = formatPercent(metrics.vehicle.annualRate);
    f.vehicleTerm = `${metrics.vehicle.termMonths} months`;
    f.vehiclePayment = formatUsd(metrics.vehicle.monthlyPaymentCents);
    f.vehicleInterest = formatUsd(metrics.vehicle.totalInterestCents);
  }
  if (h.kind === "gain" && h.delayMonths !== null && h.delayMonths < 0) f.goalSooner = formatDelay(-h.delayMonths);
  if (metrics.debtPayment) {
    const d = metrics.debtPayment;
    f.debtPaid = formatUsd(d.paidCents);
    f.debtSaved = formatUsd(d.annualInterestSavedCents);
    f.debtRate = formatPercent(d.annualRate);
    f.checkingAfter = formatUsd(d.checkingAfterCents);
    if (d.freedMonthlyCents > 0) f.debtFreed = formatUsd(d.freedMonthlyCents);
    if (d.remainingCents > 0) f.debtRemaining = formatUsd(d.remainingCents);
    f.debtBalance = formatUsd(d.balanceCents);
    f.debtRemainingInterest = formatUsd(d.remainingAnnualInterestCents);
    f.debtFullSaved = formatUsd(d.fullAnnualInterestCents);
  }
  const invest = metrics.alternatives.find((a) => a.kind === "invest");
  const savings = metrics.alternatives.find((a) => a.kind === "savings");
  const topDebt = metrics.alternatives.find((a) => a.kind === "debt");
  if (invest) f.investRate = formatPercent(invest.annualRate);
  if (savings) f.savingsRate = formatPercent(savings.annualRate);
  if (topDebt) f.topDebtRate = formatPercent(topDebt.annualRate);
  if (metrics.splitPlan) {
    const s = metrics.splitPlan;
    f.splitFromChecking = formatUsd(s.fromCheckingCents);
    f.splitOnCard = formatUsd(s.onPromoCardCents);
    f.splitMonthly = formatUsd(s.monthlyPaymentCents);
    f.splitPayoffMonths = `${s.payoffMonths} months`;
    f.promoEnds = formatMonthYear(s.promoEndsOn);
  }
  return f;
}

/** The one figure the card leads with, shown large and on the badge. */
function leadFigure(context: CopilotContext, metrics: CopilotMetrics, f: Record<string, string>): CopilotCard["lead"] {
  const h = metrics.headline;
  if (h.goalName && h.kind === "odds" && statusChange(h)) return { label: h.goalName, value: statusChange(h)! };
  if (h.goalName && h.kind === "delay" && f.goalDelay) return { label: h.goalName, value: `${f.goalDelay} later` };
  if (h.goalName && h.kind === "out_of_reach") return { label: h.goalName, value: "Out of reach" };
  if (metrics.debtPayment?.isMinimumOnly && f.debtRemainingInterest) {
    return { label: "Interest you'd still pay", value: `${f.debtRemainingInterest} a year` };
  }
  if (f.debtSaved) return { label: "Interest saved", value: `${f.debtSaved} a year` };
  if (h.goalName && h.kind === "gain") {
    if (f.goalSooner) return { label: h.goalName, value: `${f.goalSooner} sooner` };
    if (statusChange(h)) return { label: h.goalName, value: statusChange(h)! };
  }
  if (metrics.verdict === "good" && context.pageType === "rental") return { label: "Rent", value: "Under your safe rent" };
  if (metrics.verdict === "good") return { label: "Your goals", value: "On track" };
  return null;
}

/** The supporting figures listed on the card. */
function keyFigures(metrics: CopilotMetrics, f: Record<string, string>): CopilotCard["keyFigures"] {
  const figures: CopilotCard["keyFigures"] = [];
  // The likelihood behind the status words, kept as a range near the disclaimer.
  const h = metrics.headline;
  if ((h.kind === "odds" || h.kind === "out_of_reach" || h.kind === "gain") && f.oddsBefore && f.oddsAfter) {
    figures.push({ label: "Chance", value: `${f.oddsBefore} → ${f.oddsAfter}` });
  }
  if (f.debtPaid) figures.push({ label: "Paid now", value: f.debtPaid });
  if (f.debtRate) figures.push({ label: "Card rate", value: f.debtRate });
  if (f.debtFreed) figures.push({ label: "Freed each month", value: f.debtFreed });
  if (f.checkingAfter) figures.push({ label: "Checking after", value: f.checkingAfter });
  if (f.checkingAfter) figures.push({ label: "Cushion target", value: f.bufferTarget! });
  if (f.fixedCostsBefore && f.fixedCostsAfter) {
    figures.push({ label: "Fixed costs of income", value: `${f.fixedCostsBefore} → ${f.fixedCostsAfter}` });
  }
  if (f.safeRent) figures.push({ label: "Safe rent", value: `${f.safeRent}/mo` });
  if (f.vehiclePayment) figures.push({ label: "Payment", value: `${f.vehiclePayment}/mo` });
  if (f.debtToIncomeBefore && f.debtToIncomeAfter) {
    figures.push({ label: "Debt-to-income", value: `${f.debtToIncomeBefore} → ${f.debtToIncomeAfter}` });
  }
  if (f.totalCost) figures.push({ label: "Total cost", value: f.totalCost });
  return figures;
}

function headlineSentence(h: Headline, f: Record<string, string>, subject: string): string {
  const goal = h.goalName ?? "your goals";
  switch (h.kind) {
    case "odds":
      if (h.statusAfter === h.statusBefore || h.statusAfter === "likely") return `${subject} makes your ${goal} less certain.`;
      if (h.statusAfter === "at risk") return `${subject} puts your ${goal} at risk.`;
      if (h.statusAfter === "unlikely") return `${subject} makes your ${goal} unlikely.`;
      return `${subject} moves your ${goal} from ${h.statusBefore} to ${h.statusAfter}.`;
    case "delay":
      return `${subject} pushes your ${goal} back ${f.goalDelay}.`;
    case "out_of_reach":
      return `${subject} puts your ${goal} out of reach.`;
    case "gain":
      return f.goalSooner
        ? `${subject} moves your ${goal} up ${f.goalSooner}.`
        : `${subject} moves your ${goal} from ${h.statusBefore} to ${h.statusAfter}.`;
    case "none":
      return "Your goals stay on track.";
  }
}

/** Deterministic card built only from the math core. The demo never shows an empty state. */
export function templateCard(context: CopilotContext, metrics: CopilotMetrics): CopilotCard {
  const f = cardFigures(context, metrics);
  const h = metrics.headline;
  const base = { keyFigures: keyFigures(metrics, f), lead: leadFigure(context, metrics, f), source: "template" as const };

  if (context.pageType === "rental") {
    const fits = metrics.safeRentThresholdCents !== null && context.priceCents <= metrics.safeRentThresholdCents;
    return {
      ...base,
      impact: headlineSentence(h, f, "This rent"),
      tradeOff: `At ${f.price} a month, fixed costs go from ${f.fixedCostsBefore} to ${f.fixedCostsAfter} of your income.`,
      smartMove: fits
        ? `It fits: you're under your safe rent of ${f.safeRent}.`
        : `Rent at or under ${f.safeRent} keeps your must-hit goals on schedule.`,
    };
  }

  if (context.pageType === "checkout") {
    const underBuffer =
      metrics.liquidBufferAfterCents !== null && metrics.liquidBufferAfterCents < metrics.bufferTargetCents;
    if (metrics.verdict === "good") {
      // Affordable: affirm it, show the cushion holds, and steer away from expensive card debt.
      const top = metrics.alternatives.find((a) => a.kind === "debt");
      const cardIsCostly = top && invest(metrics) !== null && top.annualRate > (invest(metrics) ?? 0);
      return {
        ...base,
        impact: h.kind === "gain" ? headlineSentence(h, f, "This purchase") : "This fits your plan: your goals stay on track.",
        tradeOff: `Paying ${f.price} leaves ${f.checkingAfter} in checking, above your ${f.bufferTarget} cushion.`,
        smartMove: cardIsCostly
          ? `Pay from checking rather than your ${top.label}, which charges ${f.topDebtRate} on a balance.`
          : "If it's planned, enjoy it.",
      };
    }
    const tradeOff = underBuffer
      ? `Paying ${f.price} in full leaves ${f.checkingAfter} in checking, under your ${f.bufferTarget} cushion, ${f.daysToPayday} before payday.`
      : `Paying in full still leaves ${f.checkingAfter} in checking.`;
    let smartMove: string;
    // When a goal stops being realistic, financing only hides the cost: steer to a cheaper
    // option or waiting instead. A split protects the cushion, not the goal.
    const severe = h.kind === "out_of_reach" || h.statusAfter === "unlikely" || h.statusAfter === "out of reach";
    if (severe && h.goalName) {
      smartMove = `A lower-priced option, or waiting a few months, protects your ${h.goalName}; splitting the cost wouldn't.`;
    } else if (metrics.splitPlan) {
      smartMove = `Pay ${f.splitFromChecking} now and put ${f.splitOnCard} on your ${metrics.splitPlan.promoCardName} at ${f.splitMonthly}/month: your cushion holds and you pay no interest.`;
    } else if (underBuffer) {
      smartMove = `Waiting ${f.daysToPayday} until payday keeps your cushion intact.`;
    } else if (h.kind === "none") {
      smartMove = "If it's planned, this one is affordable.";
    } else {
      smartMove = "If it can wait, a few months of saving first keeps your goals on pace.";
    }
    return { ...base, impact: headlineSentence(h, f, "This purchase"), tradeOff, smartMove };
  }

  if (context.pageType === "debt_payment") return debtCard(metrics, f, base);

  return {
    ...base,
    impact: headlineSentence(h, f, "This loan"),
    tradeOff: `At an assumed ${f.vehicleRate} over ${f.vehicleTerm}, that's ${f.vehiclePayment}/month and ${f.vehicleInterest} in interest.`,
    smartMove: `Compare the total cost, ${f.totalCost}, before you submit a credit application.`,
  };
}

function invest(metrics: CopilotMetrics): number | null {
  return metrics.alternatives.find((a) => a.kind === "invest")?.annualRate ?? null;
}

function debtCard(
  metrics: CopilotMetrics,
  f: Record<string, string>,
  base: Pick<CopilotCard, "keyFigures" | "lead" | "source">,
): CopilotCard {
  const d = metrics.debtPayment;
  if (!d) {
    return {
      ...base,
      impact: "Paying down a card balance is a guaranteed return.",
      tradeOff: "There's no card balance on file to compare this payment against.",
      smartMove: "Load your accounts in FinVantage to see exactly what it saves.",
    };
  }
  const h = metrics.headline;
  const what = d.paysOffInFull ? `paying off your ${d.accountName}` : `paying ${f.debtPaid} toward your ${d.accountName}`;
  const beats = f.savingsRate
    ? `better than investing (${f.investRate}) or savings (${f.savingsRate})`
    : `better than investing (${f.investRate})`;
  const underBuffer = d.checkingAfterCents < metrics.bufferTargetCents;

  if (metrics.verdict === "caution") {
    return {
      ...base,
      impact: headlineSentence(h, f, "This payment"),
      tradeOff: `It still saves about ${f.debtSaved} a year in interest at ${f.debtRate}.`,
      smartMove: "Splitting it across two paydays softens the hit to your goals.",
    };
  }
  if (d.isMinimumOnly) {
    return {
      ...base,
      impact: `Paying only the minimum keeps ${f.debtRemaining} on your ${d.accountName} at ${f.debtRate}.`,
      tradeOff: `That's about ${f.debtRemainingInterest} a year in interest.`,
      smartMove: d.canPayInFull
        ? `Paying the full ${f.debtBalance} saves about ${f.debtFullSaved} a year, and checking stays above your ${f.bufferTarget} cushion.`
        : "Anything above the minimum cuts that interest; even a little helps.",
    };
  }
  if (metrics.verdict === "neutral") {
    return {
      ...base,
      impact: `${what.charAt(0).toUpperCase()}${what.slice(1)} saves about ${f.debtSaved} a year in interest.`,
      tradeOff: `At ${f.debtRate}, investing (${f.investRate}) may earn more over time.`,
      smartMove: "Either way helps: extra payments are a guaranteed return.",
    };
  }

  let smartMove: string;
  if (underBuffer) {
    smartMove = `It takes checking to ${f.checkingAfter}, under your ${f.bufferTarget} cushion; splitting it across two paydays keeps it.`;
  } else if (f.debtFreed) {
    smartMove =
      h.kind === "gain" && h.goalName && f.oddsAfter && !f.goalSooner
        ? `Then send the ${f.debtFreed} minimum to your goals each month: your ${h.goalName} becomes ${h.statusAfter}.`
        : `Then send the ${f.debtFreed} minimum to your goals each month.`;
  } else if (f.debtRemaining && d.canPayInFull) {
    smartMove = `You can afford the full ${f.debtBalance}: that saves about ${f.debtFullSaved} a year and keeps your ${f.bufferTarget} cushion.`;
  } else if (f.debtRemaining) {
    smartMove = `Clearing the remaining ${f.debtRemaining} next ends the interest for good.`;
  } else {
    smartMove = `Checking stays at ${f.checkingAfter}, above your ${f.bufferTarget} cushion.`;
  }
  return {
    ...base,
    impact: `Great move: ${what} saves about ${f.debtSaved} a year in interest.`,
    tradeOff: `That's a ${f.debtRate} guaranteed return, ${beats}.`,
    smartMove,
  };
}

const CARD_TIMEOUT_MS = 2_000;

const CARD_SCHEMA = {
  type: "object",
  properties: {
    impact: { type: "string" },
    tradeOff: { type: "string" },
    smartMove: { type: "string" },
  },
  required: ["impact", "tradeOff", "smartMove"],
};

const SYSTEM_PROMPT = [
  "You write a short financial Copilot card shown while someone is about to spend or pay money.",
  "Return JSON with three fields: impact, tradeOff, smartMove. Under 60 words in total.",
  "`verdict` is decided by the math, never by you. If it is \"caution\", the move hurts a goal or the cash cushion: say so plainly and offer a better path. If it is \"good\", affirm the choice and say why it beats the alternatives in `alternatives`. If \"neutral\", lay out the trade-off evenly.",
  "impact: one sentence. If headline.kind is delay, odds, out_of_reach, or gain, name that goal and what happens to it. For a good debt payment, lead with the interest saved.",
  "Describe how likely a goal is only with the words in headline.statusBefore and headline.statusAfter (on track, likely, at risk, unlikely, out of reach). Never say \"odds\" or give a percentage.",
  "tradeOff: one sentence on the cost or the comparison, using the given figures.",
  "smartMove: one sentence with a concrete next step. If a split plan is given, describe it.",
  "Copy figures exactly as given, including symbols. Never calculate, round, invent, or alter a number. Do not mention any number that is not in `figures`.",
  "Tone: direct, plain, and warm, like a friend who is good with money. Make the goal feel real, but never shame or lecture. Suggest, never instruct.",
].join("\n");

/** Math first, words second. Any LLM failure or guardrail rejection returns the template card. */
export async function generateCopilotCard(
  llm: LlmClient,
  context: CopilotContext,
  metrics: CopilotMetrics,
): Promise<CopilotCard> {
  const fallback = templateCard(context, metrics);
  try {
    const figures = cardFigures(context, metrics);
    const h = metrics.headline;
    const raw = await llm.generate({
      tier: "pro",
      // The card must appear within 3 seconds (PRD). Past this, the template card shows.
      timeoutMs: CARD_TIMEOUT_MS,
      // Default thinking blows the 2-second budget. The figures are fixed, so there is nothing to reason out.
      thinking: "minimal",
      system: SYSTEM_PROMPT,
      jsonSchema: CARD_SCHEMA,
      prompt: JSON.stringify({
        page: context.pageType,
        merchant: context.merchant,
        verdict: metrics.verdict,
        headline: { kind: h.kind, goal: h.goalName, statusBefore: h.statusBefore, statusAfter: h.statusAfter },
        alternatives: metrics.alternatives.map((a) => ({ label: a.label, rate: formatPercent(a.annualRate) })),
        debtAccount: metrics.debtPayment?.accountName ?? null,
        figures,
        splitPlanCard: metrics.splitPlan?.promoCardName ?? null,
        exampleCard: { impact: fallback.impact, tradeOff: fallback.tradeOff, smartMove: fallback.smartMove },
      }),
    });
    const parsed = JSON.parse(raw) as Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">;
    if (typeof parsed.impact !== "string" || typeof parsed.tradeOff !== "string" || typeof parsed.smartMove !== "string") {
      return fallback;
    }
    // The card must lead with the goal the math core picked.
    if (h.kind !== "none" && !metrics.debtPayment && h.goalName && !parsed.impact.toLowerCase().includes(h.goalName.toLowerCase())) {
      return fallback;
    }
    // Names can contain digits ("0% Promo Card"), so they count as allowed text too.
    const names = [
      metrics.splitPlan?.promoCardName,
      metrics.debtPayment?.accountName,
      h.goalName,
      ...metrics.alternatives.map((a) => a.label),
    ].filter((n): n is string => !!n);
    const verdict = validateCard(parsed, [...Object.values(figures), ...names]);
    if (!verdict.ok) return fallback;
    return {
      impact: parsed.impact,
      tradeOff: parsed.tradeOff,
      smartMove: parsed.smartMove,
      keyFigures: fallback.keyFigures,
      lead: fallback.lead,
      source: "llm",
    };
  } catch {
    return fallback;
  }
}
