import {
  formatPercent,
  formatUsd,
  type CopilotCard,
  type CopilotContext,
  type CopilotMetrics,
} from "@finvantage/contracts";
import type { LlmClient } from "./client";
import { cardText, validateCard } from "./guardrails";

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

/**
 * An interest rate as the lender states it: 12.5% stays 12.5%, 22.99% stays 22.99%. Whole-number
 * rounding is for estimates (shares, the assumed 7% return), not for a rate someone is charged.
 */
export function formatRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
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

/**
 * Math-core status words, reworded for a shopper. "Likely" read as good news even when a card
 * warned about a drop, so on the card it is "probably OK". The dashboard keeps math-core's words.
 */
const CARD_STATUS: Record<string, string> = {
  "on track": "on track",
  likely: "probably OK",
  "at risk": "at risk",
  unlikely: "unlikely",
  "out of reach": "out of reach",
};

export function cardStatus(status: string | null): string | null {
  return status === null ? null : (CARD_STATUS[status] ?? status);
}

/** "At risk (was on track)", or "At risk" when the status does not change. */
function statusChange(h: Headline): string | null {
  const before = cardStatus(h.statusBefore);
  const after = cardStatus(h.statusAfter);
  if (!before || !after) return null;
  return before === after ? cap(after) : `${cap(after)} (was ${before})`;
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
  if (metrics.liquidBufferAfterCents !== null) {
    // More than is in checking: say how short, never show a negative balance.
    if (metrics.liquidBufferAfterCents < 0) f.checkingShort = formatUsd(-metrics.liquidBufferAfterCents);
    else f.checkingAfter = formatUsd(metrics.liquidBufferAfterCents);
  }
  if (metrics.daysUntilPayday !== null) f.daysToPayday = `${metrics.daysUntilPayday} days`;
  if (metrics.safeRentThresholdCents !== null) f.safeRent = formatUsd(metrics.safeRentThresholdCents);
  if (metrics.totalCostOfOwnershipCents !== null) f.totalCost = formatUsd(metrics.totalCostOfOwnershipCents);
  if (metrics.opportunityCostCents !== null && metrics.opportunityHorizonYears !== null) {
    f.opportunityCost = formatUsd(metrics.opportunityCostCents);
    f.opportunityYears = `${metrics.opportunityHorizonYears} years`;
  }
  if (metrics.vehicle) {
    f.vehicleRate = formatRate(metrics.vehicle.annualRate);
    f.vehicleTerm = `${metrics.vehicle.termMonths} months`;
    f.vehiclePayment = formatUsd(metrics.vehicle.monthlyPaymentCents);
    f.vehicleInterest = formatUsd(metrics.vehicle.totalInterestCents);
  }
  if (h.kind === "gain" && h.delayMonths !== null && h.delayMonths < 0) f.goalSooner = formatDelay(-h.delayMonths);
  if (metrics.debtPayment) {
    const d = metrics.debtPayment;
    f.debtPaid = formatUsd(d.paidCents);
    f.debtSaved = formatUsd(d.annualInterestSavedCents);
    f.debtRate = formatRate(d.annualRate);
    // A payment bigger than checking: say how short, never show a negative balance.
    delete f.checkingAfter;
    delete f.checkingShort;
    if (d.checkingAfterCents < 0) f.checkingShort = formatUsd(-d.checkingAfterCents);
    else f.checkingAfter = formatUsd(d.checkingAfterCents);
    if (d.freedMonthlyCents > 0) f.debtFreed = formatUsd(d.freedMonthlyCents);
    if (d.remainingCents > 0) f.debtRemaining = formatUsd(d.remainingCents);
    f.debtBalance = formatUsd(d.balanceCents);
    f.debtRemainingInterest = formatUsd(d.remainingAnnualInterestCents);
    f.debtFullSaved = formatUsd(d.fullAnnualInterestCents);
  }
  // The cushion only means something next to what checking would be left at. Without that
  // figure, a model would pair the cushion with rent or a car loan, which the math never said.
  if (metrics.transfer) f.transferAmount = formatUsd(metrics.transfer.amountCents);
  if (metrics.purchaseSize?.big) {
    if (metrics.purchaseSize.monthlyIncomeShare !== null) f.incomeShare = formatPercent(metrics.purchaseSize.monthlyIncomeShare);
    if (metrics.purchaseSize.spareCashShare !== null && metrics.purchaseSize.spareCashShare <= 1) {
      f.spareShare = formatPercent(metrics.purchaseSize.spareCashShare);
    }
  }
  if (metrics.payFirst) {
    f.payFirstBalance = formatUsd(metrics.payFirst.balanceCents);
    f.payFirstRate = formatRate(metrics.payFirst.annualRate);
  }
  // The cushion is this payment's business only when checking was at or above it beforehand. When
  // it was already under, the card leaves the cushion out, so no card (and no model, by the number
  // check) blames a $13 purchase for a gap it didn't cause.
  const leftCents = metrics.debtPayment?.checkingAfterCents ?? metrics.liquidBufferAfterCents;
  const cashOutCents = metrics.debtPayment?.paidCents ?? (leftCents !== null ? context.priceCents : 0);
  const cushionApplies = leftCents !== null && leftCents + cashOutCents >= metrics.bufferTargetCents;
  // What checking holds before paying: the bank's available balance, which can be lower than the
  // current balance the dashboard shows while charges are pending. Shown so the two can be matched.
  if (leftCents !== null) f.checkingBefore = formatUsd(leftCents + cashOutCents);
  if ((f.checkingAfter || f.checkingShort) && cushionApplies) f.bufferTarget = formatUsd(metrics.bufferTargetCents);
  // How far under the cushion, computed here so a model never has to subtract.
  if (f.checkingAfter && cushionApplies && leftCents !== null && leftCents < metrics.bufferTargetCents) {
    f.underCushionBy = formatUsd(metrics.bufferTargetCents - leftCents);
  }
  const invest = metrics.alternatives.find((a) => a.kind === "invest");
  const savings = metrics.alternatives.find((a) => a.kind === "savings");
  const topDebt = metrics.alternatives.find((a) => a.kind === "debt");
  if (invest) f.investRate = formatPercent(invest.annualRate);
  if (savings) f.savingsRate = formatRate(savings.annualRate);
  if (topDebt) f.topDebtRate = formatRate(topDebt.annualRate);
  if (metrics.splitPlan && !goalBeyondFinancing(h)) {
    const s = metrics.splitPlan;
    f.splitFromChecking = formatUsd(s.fromCheckingCents);
    f.splitOnCard = formatUsd(s.onPromoCardCents);
    f.splitMonthly = formatUsd(s.monthlyPaymentCents);
    f.splitPayoffMonths = `${s.payoffMonths} months`;
    f.promoEnds = formatMonthYear(s.promoEndsOn);
  }
  return f;
}

/**
 * True when this purchase makes a goal stop being realistic. Financing would only hide the cost
 * then, so the card points to a cheaper option or waiting, and the split figures are not offered
 * to the model.
 */
function goalBeyondFinancing(h: Headline): boolean {
  if (!h.goalName) return false;
  if (h.kind === "out_of_reach") return true;
  // Only when this purchase is what pushed the goal there. A goal that was already unlikely and
  // only slips a little doesn't make the split bad advice.
  const fellTo = (status: string) => h.statusAfter === status && h.statusBefore !== status;
  return fellTo("unlikely") || fellTo("out of reach");
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
  if (metrics.verdict === "neutral" && context.pageType === "checkout" && (f.incomeShare || f.spareShare)) {
    return f.incomeShare
      ? { label: "Big purchase", value: `${f.incomeShare} of monthly income` }
      : { label: "Big purchase", value: `${f.spareShare} of spare savings` };
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
    figures.push({ label: `Chance you reach your ${h.goalName ?? "goal"}`, value: `${f.oddsBefore} → ${f.oddsAfter}` });
  }
  if (f.debtPaid) figures.push({ label: "You're paying", value: f.debtPaid });
  if (f.debtRate) figures.push({ label: "Card interest rate", value: f.debtRate });
  if (f.debtFreed) figures.push({ label: "Freed up each month", value: f.debtFreed });
  if (f.incomeShare) figures.push({ label: "Share of a month's income", value: f.incomeShare });
  if (f.spareShare) figures.push({ label: "Share of your spare savings", value: f.spareShare });
  if (f.checkingBefore) figures.push({ label: "Available in checking", value: f.checkingBefore });
  if (f.checkingAfter) figures.push({ label: "Left in checking", value: f.checkingAfter });
  if (f.checkingShort) figures.push({ label: "Short in checking", value: f.checkingShort });
  if (f.transferAmount && metrics.transfer) {
    figures.push({ label: `Move from ${metrics.transfer.fromAccountName}`, value: f.transferAmount });
  }
  if (f.bufferTarget) figures.push({ label: "Your safety cushion", value: f.bufferTarget });
  if (f.fixedCostsBefore && f.fixedCostsAfter) {
    figures.push({ label: "Income going to bills", value: `${f.fixedCostsBefore} → ${f.fixedCostsAfter}` });
  }
  if (f.safeRent) figures.push({ label: "Rent you can afford", value: `${f.safeRent}/mo` });
  if (f.vehiclePayment) figures.push({ label: "Monthly payment", value: `${f.vehiclePayment}/mo` });
  if (f.debtToIncomeBefore && f.debtToIncomeAfter) {
    figures.push({ label: "Income going to debt", value: `${f.debtToIncomeBefore} → ${f.debtToIncomeAfter}` });
  }
  if (f.totalCost) figures.push({ label: "Total cost with interest", value: f.totalCost });
  return figures;
}

function headlineSentence(h: Headline, f: Record<string, string>, subject: string): string {
  const goal = h.goalName ?? "your goals";
  switch (h.kind) {
    case "odds":
      if (h.statusAfter === h.statusBefore || h.statusAfter === "likely") return `${subject} makes your ${goal} a bit less certain.`;
      if (h.statusAfter === "at risk") return `${subject} puts your ${goal} at risk.`;
      if (h.statusAfter === "unlikely") return `${subject} makes your ${goal} unlikely to happen.`;
      return `${subject} moves your ${goal} from ${cardStatus(h.statusBefore)} to ${cardStatus(h.statusAfter)}.`;
    case "delay":
      return `${subject} pushes your ${goal} back ${f.goalDelay}.`;
    case "out_of_reach":
      return `${subject} puts your ${goal} out of reach.`;
    case "gain":
      return f.goalSooner
        ? `${subject} moves your ${goal} up ${f.goalSooner}.`
        : `${subject} moves your ${goal} from ${cardStatus(h.statusBefore)} to ${cardStatus(h.statusAfter)}.`;
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
      tradeOff: `At ${f.price} a month, bills would take ${f.fixedCostsAfter} of your income, up from ${f.fixedCostsBefore}.`,
      smartMove: fits
        ? `It fits: you can afford rent up to ${f.safeRent}.`
        : `Look for rent at ${f.safeRent} or less to keep your goals on schedule.`,
    };
  }

  if (context.pageType === "checkout") {
    // Only when the cushion is this purchase's business (checking was at or above it before).
    const underBuffer =
      !!f.bufferTarget && metrics.liquidBufferAfterCents !== null && metrics.liquidBufferAfterCents < metrics.bufferTargetCents;
    if (metrics.verdict === "good") {
      // Affordable: affirm it, show the cushion holds, and steer away from expensive card debt.
      const top = metrics.alternatives.find((a) => a.kind === "debt");
      const cardIsCostly = top && invest(metrics) !== null && top.annualRate > (invest(metrics) ?? 0);
      return {
        ...base,
        impact: h.kind === "gain" ? headlineSentence(h, f, "This purchase") : "This fits your plan: your goals stay on track.",
        tradeOff: metrics.transfer
          ? f.checkingShort
            ? `Checking alone is ${f.checkingShort} short, but you have savings you aren't using for a goal.`
            : `It would leave ${f.checkingAfter} in checking, under your ${f.bufferTarget} safety cushion, but you have savings to top it up.`
          : !f.bufferTarget || f.underCushionBy
            ? `You'd still have ${f.checkingAfter} in checking to pay for it.`
            : `You'd still have ${f.checkingAfter} in checking, more than your ${f.bufferTarget} safety cushion.`,
        smartMove: metrics.transfer
          ? f.bufferTarget
            ? `Move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first. That keeps your ${f.bufferTarget} safety cushion.`
            : `Move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first, so checking covers it.`
          : cardIsCostly
          ? `Pay from checking, not your ${top.label}. That card charges ${f.topDebtRate} interest if you carry a balance.`
          : "If you planned for it, enjoy it.",
      };
    }
    if (metrics.verdict === "neutral" && metrics.purchaseSize?.big) {
      // Affordable, but big for this person. A good advisor says so and points to the better order.
      const size = f.incomeShare
        ? `It's ${f.incomeShare} of a month's income${f.spareShare ? ` and ${f.spareShare} of your spare savings` : ""}.`
        : `It's ${f.spareShare} of your spare savings.`;
      const from = metrics.transfer ? ` Then move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking.` : "";
      return {
        ...base,
        impact: "You can afford this, but it's a big purchase for you.",
        tradeOff: size,
        smartMove: metrics.payFirst
          ? `Pay off your ${metrics.payFirst.accountName} (${f.payFirstBalance} at ${f.payFirstRate}) first: that's a guaranteed return.${from}`
          : metrics.transfer
            ? `If it's planned, move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first.`
            : "If it's planned, it fits. If not, waiting a few days is a good test.",
      };
    }
    const tradeOff = f.checkingShort
      ? `You don't have ${f.price} in checking: you'd be ${f.checkingShort} short, with payday ${f.daysToPayday} away.`
      : underBuffer
        ? `Paying ${f.price} at once leaves ${f.checkingAfter} in checking, below your ${f.bufferTarget} safety cushion, with payday ${f.daysToPayday} away.`
        : `Paying all at once still leaves ${f.checkingAfter} in checking.`;
    let smartMove: string;
    // When a goal stops being realistic, financing only hides the cost: steer to a cheaper
    // option or waiting instead. A split protects the cushion, not the goal.
    if (goalBeyondFinancing(h)) {
      smartMove = `A cheaper option, or waiting a few months, protects your ${h.goalName!}. Splitting the cost wouldn't.`;
    } else if (metrics.transfer) {
      smartMove = f.bufferTarget
        ? `Move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first, so you keep your ${f.bufferTarget} safety cushion.`
        : `Move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first, so checking covers it.`;
    } else if (metrics.splitPlan && f.splitOnCard) {
      smartMove = `Pay ${f.splitFromChecking} now and put ${f.splitOnCard} on your ${metrics.splitPlan.promoCardName} (${f.splitMonthly}/month). You keep your safety cushion and pay no interest.`;
    } else if (underBuffer) {
      smartMove = `Waiting ${f.daysToPayday} until payday keeps your safety cushion whole.`;
    } else if (h.kind === "none") {
      smartMove = "If you planned for it, you can afford it.";
    } else {
      smartMove = "If it can wait, saving up for a few months first keeps your goals on pace.";
    }
    return { ...base, impact: headlineSentence(h, f, "This purchase"), tradeOff, smartMove };
  }

  if (context.pageType === "debt_payment") return debtCard(metrics, f, base);

  return {
    ...base,
    impact: headlineSentence(h, f, "This loan"),
    tradeOff: `With a typical ${f.vehicleRate} loan over ${f.vehicleTerm}, that's ${f.vehiclePayment} a month and ${f.vehicleInterest} in interest.`,
    smartMove: `All in, you'd pay ${f.totalCost}. Compare that before you apply for a loan.`,
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
      impact: "Paying down a credit card always saves you interest.",
      tradeOff: "We don't have a card balance on file to compare this payment to.",
      smartMove: "Add your accounts in FinVantage to see exactly what it saves.",
    };
  }
  const h = metrics.headline;
  const what = d.paysOffInFull ? `paying off your ${d.accountName}` : `paying ${f.debtPaid} toward your ${d.accountName}`;
  const beats = f.savingsRate
    ? `more than investing (${f.investRate}) or a savings account (${f.savingsRate}) would earn`
    : `more than investing (${f.investRate}) would earn`;
  const underBuffer = !!f.bufferTarget && d.checkingAfterCents < metrics.bufferTargetCents;

  if (metrics.verdict === "caution") {
    return {
      ...base,
      impact: headlineSentence(h, f, "This payment"),
      tradeOff: `It does save about ${f.debtSaved} a year in ${f.debtRate} interest.`,
      smartMove: "Splitting it across two paydays makes it easier on your goals.",
    };
  }
  if (d.isMinimumOnly) {
    return {
      ...base,
      impact: `Paying only the minimum leaves ${f.debtRemaining} on your ${d.accountName}, still charging ${f.debtRate} interest.`,
      tradeOff: `That costs you about ${f.debtRemainingInterest} a year.`,
      smartMove: d.canPayInFull && f.bufferTarget
        ? `Paying the full ${f.debtBalance} saves about ${f.debtFullSaved} a year, and you keep your ${f.bufferTarget} safety cushion.`
        : "Anything above the minimum cuts that interest. Even a little helps.",
    };
  }
  if (metrics.verdict === "neutral") {
    return {
      ...base,
      impact: `${what.charAt(0).toUpperCase()}${what.slice(1)} saves about ${f.debtSaved} a year in interest.`,
      tradeOff: `At ${f.debtRate}, investing (${f.investRate}) might earn more over time.`,
      smartMove: "Either choice helps. Paying down debt is a sure thing.",
    };
  }

  let smartMove: string;
  if (metrics.transfer) {
    smartMove = f.bufferTarget
      ? `Move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first, so you keep your ${f.bufferTarget} safety cushion.`
      : `Move ${f.transferAmount} from your ${metrics.transfer.fromAccountName} to checking first, so checking covers it.`;
  } else if (f.checkingShort) {
    smartMove = `Checking would be ${f.checkingShort} short. Pay what you can now and the rest on payday.`;
  } else if (underBuffer) {
    smartMove = `It drops checking to ${f.checkingAfter}, below your ${f.bufferTarget} safety cushion. Splitting it across two paydays avoids that.`;
  } else if (f.debtFreed) {
    smartMove =
      h.kind === "gain" && h.goalName && f.oddsAfter && !f.goalSooner
        ? `Then put the ${f.debtFreed} you were paying each month toward your goals. Your ${h.goalName} becomes ${cardStatus(h.statusAfter)}.`
        : `Then put the ${f.debtFreed} you were paying each month toward your goals.`;
  } else if (f.debtRemaining && d.canPayInFull && f.bufferTarget) {
    smartMove = `You can afford the full ${f.debtBalance}. That saves about ${f.debtFullSaved} a year and keeps your ${f.bufferTarget} safety cushion.`;
  } else if (f.debtRemaining) {
    smartMove = `Paying off the other ${f.debtRemaining} next stops the interest for good.`;
  } else {
    smartMove = f.bufferTarget
      ? `You'd still have ${f.checkingAfter} in checking, more than your ${f.bufferTarget} safety cushion.`
      : `You'd still have ${f.checkingAfter} in checking.`;
  }
  return {
    ...base,
    impact: `Great move: ${what} saves about ${f.debtSaved} a year in interest.`,
    tradeOff: `Wiping out ${f.debtRate} interest is like a guaranteed ${f.debtRate} return, ${beats}.`,
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
  "You write a short card that pops up while an everyday American shopper is about to spend or pay money. Most readers are not finance experts.",
  "Return JSON with three fields: impact, tradeOff, smartMove. Under 50 words in total.",
  "`verdict` is decided by the math, never by you. If it is \"caution\", the move hurts a goal or the safety cushion: say so plainly and offer a better path. If it is \"good\", say the choice works and why. If \"neutral\", lay out the trade-off evenly.",
  "impact: one short sentence a reader gets at a glance. If headline.kind is delay, odds, out_of_reach, or gain, name that goal and what happens to it. For a good debt payment, lead with the interest saved.",
  "Describe how likely a goal is only with the words in headline.statusBefore and headline.statusAfter. Never say \"odds\" or give a percentage.",
  "tradeOff: one sentence on the cost, using the given figures.",
  "smartMove: one sentence with a concrete next step the reader could take. If a split plan is given, describe it. If none is given, never suggest putting the cost on a card or financing it.",
  "If `figures.checkingShort` is given, the reader doesn't have enough in checking: say they'd be that amount short. Never write a negative dollar amount.",
  "If `transferFrom` is given, the reader has savings no goal is using: the next step is moving `figures.transferAmount` from that account to checking first. Prefer it over any card or financing.",
  "If the verdict is \"good\", don't dwell on the safety cushion: the purchase itself is fine.",
  "For a purchase with verdict \"neutral\": the reader can afford it, but it's big for them. Say so using `figures.incomeShare` or `figures.spareShare`. If `payFirst` is given, suggest paying that debt off first (`figures.payFirstBalance` at `figures.payFirstRate`), because it's a guaranteed return.",
  "Plain words only, like you'd text a friend. Short sentences. Call `bufferTarget` the reader's \"safety cushion\" (money they keep in checking), and mention it only when `figures.checkingAfter` is given. `checkingAfter` is what would be left in checking; the cushion is the amount they like to keep. Never call one by the other's name. If `figures.underCushionBy` is given, that is how far below the cushion they'd be. Say \"bills\" for fixed costs and \"debt payments\" for debt-to-income. Never use: buffer, liquidity, fixed costs, debt-to-income, allocate, financial health, optimize, leverage.",
  "Copy figures exactly as given, including symbols. Never calculate, round, invent, or alter a number. Do not mention any number that is not in `figures`.",
  "Tone: direct and warm, like a friend who is good with money. Make the goal feel real, but never shame or lecture. Suggest, never instruct.",
].join("\n");

type CardWords = Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">;

/** Words an everyday shopper should not have to decode. A model card that uses one is rejected. */
export const CARD_JARGON =
  /\b(buffer|liquidity|fixed[- ]costs?|debt[- ]to[- ]income|DTI|allocat\w*|financial health|optimi[sz]\w*|leverag\w*|odds)\b/i;

/**
 * Validated Gemini wordings, per client, keyed by the exact prompt. The simulator is
 * deterministic, so the same page and profile give the same prompt: reopening a page reuses the
 * earlier card instead of spending a request (the free tier allows 5 a minute).
 */
const cardCache = new WeakMap<LlmClient, Map<string, CardWords>>();
const CARD_CACHE_LIMIT = 200;

/** Math first, words second. Any LLM failure or guardrail rejection returns the template card. */
export async function generateCopilotCard(
  llm: LlmClient,
  context: CopilotContext,
  metrics: CopilotMetrics,
): Promise<CopilotCard> {
  const fallback = templateCard(context, metrics);
  const llmCard = (words: CardWords): CopilotCard => ({
    ...words,
    keyFigures: fallback.keyFigures,
    lead: fallback.lead,
    source: "llm",
  });
  const useTemplate = (reason: string): CopilotCard => {
    // The mock provider always throws by design, so only a real provider's failure is worth a line.
    if (llm.provider !== "mock") console.warn(`Copilot card: template used (${reason})`);
    return fallback;
  };

  const h = metrics.headline;
  let figures: ReturnType<typeof cardFigures>;
  try {
    figures = cardFigures(context, metrics);
  } catch (error) {
    return useTemplate(`figures: ${error instanceof Error ? error.message : String(error)}`);
  }
  const prompt = JSON.stringify({
    page: context.pageType,
    merchant: context.merchant,
    verdict: metrics.verdict,
    headline: { kind: h.kind, goal: h.goalName, statusBefore: cardStatus(h.statusBefore), statusAfter: cardStatus(h.statusAfter) },
    alternatives: metrics.alternatives.map((a) => ({ label: a.label, rate: a.kind === "invest" ? formatPercent(a.annualRate) : formatRate(a.annualRate) })),
    debtAccount: metrics.debtPayment?.accountName ?? null,
    figures,
    splitPlanCard: figures.splitOnCard ? (metrics.splitPlan?.promoCardName ?? null) : null,
    transferFrom: metrics.transfer?.fromAccountName ?? null,
    payFirst: metrics.payFirst?.accountName ?? null,
    exampleCard: { impact: fallback.impact, tradeOff: fallback.tradeOff, smartMove: fallback.smartMove },
  });

  let cache = cardCache.get(llm);
  if (!cache) cardCache.set(llm, (cache = new Map()));
  const cached = cache.get(prompt);
  if (cached) return llmCard(cached);

  let parsed: CardWords;
  try {
    const raw = await llm.generate({
      tier: "flash",
      // The card must appear within 3 seconds (PRD). Past this, the template card shows.
      timeoutMs: CARD_TIMEOUT_MS,
      // Default thinking blows the 2-second budget. The figures are fixed, so there is nothing to reason out.
      thinking: "minimal",
      system: SYSTEM_PROMPT,
      jsonSchema: CARD_SCHEMA,
      prompt,
    });
    parsed = JSON.parse(raw) as CardWords;
  } catch (error) {
    return useTemplate(error instanceof Error ? error.message : String(error));
  }

  if (typeof parsed?.impact !== "string" || typeof parsed.tradeOff !== "string" || typeof parsed.smartMove !== "string") {
    return useTemplate("reply is missing a field");
  }
  // The card must lead with the goal the math core picked.
  if (h.kind !== "none" && !metrics.debtPayment && h.goalName && !parsed.impact.toLowerCase().includes(h.goalName.toLowerCase())) {
    return useTemplate(`impact does not name the ${h.goalName} goal`);
  }
  // Names can contain digits ("0% Promo Card"), so they count as allowed text too.
  const names = [
    figures.splitOnCard ? metrics.splitPlan?.promoCardName : undefined,
    metrics.transfer?.fromAccountName,
    metrics.payFirst?.accountName,
    metrics.debtPayment?.accountName,
    h.goalName,
    ...metrics.alternatives.map((a) => a.label),
  ].filter((n): n is string => !!n);
  const verdict = validateCard(parsed, [...Object.values(figures), ...names]);
  if (!verdict.ok) return useTemplate(`guardrail: ${verdict.reason}`);
  if (/-\s?\$/.test(cardText(parsed))) return useTemplate("negative dollar amount");
  const jargon = cardText(parsed).match(CARD_JARGON);
  if (jargon) return useTemplate(`jargon: "${jargon[0]}"`);

  const words = { impact: parsed.impact, tradeOff: parsed.tradeOff, smartMove: parsed.smartMove };
  if (cache.size >= CARD_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(prompt, words);
  return llmCard(words);
}
