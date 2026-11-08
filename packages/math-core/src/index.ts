import {
  isLiability,
  type CopilotContext,
  type CopilotMetrics,
  type FinancialSnapshot,
  type Goal,
  type GoalImpact,
} from "@finvantage/contracts";

/*
 * The deterministic math core. Every figure on a Copilot card comes from here, before any LLM
 * call. Assumptions are named constants so the UI can explain every number (PRD section 4).
 */

export const OPPORTUNITY_HORIZON_YEARS = 10;
export const ASSUMED_ANNUAL_RETURN = 0.07;

/** Vehicle quotes carry no term or rate (privacy rule), so we assume typical financing. */
export const VEHICLE_TERM_MONTHS = 60;
export const VEHICLE_ANNUAL_RATE = 0.07;

/** Safe rent is rounded down to this step so it reads like a real search filter. */
export const SAFE_RENT_ROUNDING_CENTS = 5_000;

/** Below these, a goal change is too small to lead a card with. */
export const HEADLINE_MIN_DELAY_MONTHS = 0.5;
export const HEADLINE_MIN_ODDS_DROP = 0.03;
/** A delay this long, or a goal that no longer finishes, reads as "out of reach". */
export const OUT_OF_REACH_DELAY_MONTHS = 24;

/**
 * Plain-language status for a goal's likelihood (the midpoint of its range), best first.
 * "At risk" starts below 80%: about a 1-in-4 or worse chance of missing.
 */
export const GOAL_STATUS: ReadonlyArray<{ minLikelihood: number; label: string }> = [
  { minLikelihood: 0.9, label: "on track" },
  { minLikelihood: 0.8, label: "likely" },
  { minLikelihood: 0.5, label: "at risk" },
  { minLikelihood: 0.1, label: "unlikely" },
  { minLikelihood: 0, label: "out of reach" },
];

export function goalStatus(low: number, high: number): string {
  const mid = (low + high) / 2;
  return GOAL_STATUS.find((s) => mid >= s.minLikelihood)?.label ?? "out of reach";
}

const MS_PER_DAY = 86_400_000;

// ---------- Small helpers ----------

export function fixedCostRatio(monthlyFixedCents: number, monthlyIncomeCents: number): number {
  return monthlyIncomeCents > 0 ? monthlyFixedCents / monthlyIncomeCents : 0;
}

export function debtToIncome(monthlyDebtCents: number, monthlyIncomeCents: number): number {
  return monthlyIncomeCents > 0 ? monthlyDebtCents / monthlyIncomeCents : 0;
}

/** Liquid runway: cash divided by daily burn. */
export function liquidRunwayDays(cashCents: number, monthlySpendingCents: number): number {
  const dailyBurn = monthlySpendingCents / 30;
  return dailyBurn > 0 ? Math.max(0, Math.floor(cashCents / dailyBurn)) : 0;
}

export function opportunityCost(amountCents: number, years: number, annualReturn: number): number {
  return Math.round(amountCents * (1 + annualReturn) ** years) - amountCents;
}

/** Standard amortized loan payment. */
export function loanPayment(principalCents: number, annualRate: number, months: number): number {
  if (months <= 0) return principalCents;
  const r = annualRate / 12;
  if (r === 0) return Math.round(principalCents / months);
  return Math.round((principalCents * r) / (1 - (1 + r) ** -months));
}

export function liquidCash(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => a.type === "checking" || a.type === "savings")
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

/**
 * Spendable checking: the bank's available balance (which excludes pending charges) when it
 * reports one, otherwise the current balance. "Can I pay for this now" is about what's spendable.
 */
export function checkingBalance(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => a.type === "checking")
    .reduce((sum, a) => sum + (a.availableBalanceCents ?? a.balanceCents), 0);
}

/**
 * Checking above the safety cushion: money that is not set aside for anything. A purchase spends
 * this first, so only the part beyond it cuts into the savings that fund goals.
 */
export function spareChecking(snapshot: FinancialSnapshot): number {
  return Math.max(0, checkingBalance(snapshot) - snapshot.bufferTargetCents);
}

/** Savings accounts that can be spent: not an HSA, which is for medical costs. CDs are their own type. */
function spendableSavings(snapshot: FinancialSnapshot) {
  return snapshot.accounts.filter((a) => a.type === "savings" && a.subtype?.toLowerCase() !== "hsa");
}

/**
 * Savings that no goal is using: what's in spendable savings minus what goals have saved so far.
 * Goals' saved amounts are assumed to sit in savings. A bank-linked user with large savings and
 * small goals has plenty; the demo profile's goals use all of its savings, so it has none.
 */
export function spareSavings(snapshot: FinancialSnapshot, goals: Goal[]): number {
  const held = spendableSavings(snapshot).reduce((sum, a) => sum + (a.availableBalanceCents ?? a.balanceCents), 0);
  const earmarked = goals.reduce((sum, g) => sum + g.currentCents, 0);
  return Math.max(0, held - earmarked);
}

/** Money not set aside for anything: checking above the cushion, plus savings no goal uses. */
export function spareCash(snapshot: FinancialSnapshot, goals: Goal[]): number {
  return spareChecking(snapshot) + spareSavings(snapshot, goals);
}

/**
 * How much to move from spare savings into checking first (whole dollars), and from which account:
 * the largest spendable one. Only what this payment causes: back up to the cushion when it is what
 * drops checking below it, or just enough to cover it when checking was already under the cushion
 * (a $13 purchase shouldn't prompt "move $2,413"). Null when checking covers it or no savings are spare.
 */
export function transferPlan(
  snapshot: FinancialSnapshot,
  goals: Goal[],
  cashOutCents: number,
): CopilotMetrics["transfer"] {
  const before = checkingBalance(snapshot);
  const target = before >= snapshot.bufferTargetCents ? snapshot.bufferTargetCents : 0;
  const gap = target - (before - cashOutCents);
  if (gap <= 0) return null;
  const amountCents = Math.min(Math.ceil(gap / 100) * 100, Math.floor(spareSavings(snapshot, goals) / 100) * 100);
  if (amountCents <= 0) return null;
  const from = spendableSavings(snapshot).sort(
    (a, b) => (b.availableBalanceCents ?? b.balanceCents) - (a.availableBalanceCents ?? a.balanceCents),
  )[0];
  return from ? { fromAccountName: from.name, amountCents } : null;
}

export function totalDebt(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => isLiability(a.type))
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

/**
 * The housing payment a new rental would replace. The snapshot has no rent field, so this is
 * the mortgage payment, or 0 for someone with no mortgage on file.
 */
export function currentHousingPayment(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => a.type === "mortgage")
    .reduce((sum, a) => sum + (a.minimumPaymentCents ?? 0), 0);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY);
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}

/** What non-negotiable goals need each month to land on their dates. */
export function nonNegotiableMonthlyNeed(snapshot: FinancialSnapshot, goals: Goal[]): number {
  return goals
    .filter((g) => g.flexibility === "non_negotiable")
    .reduce((sum, g) => {
      const months = Math.max(1, monthsBetween(snapshot.asOf, g.targetDate));
      return sum + Math.max(0, (g.targetCents - g.currentCents) / months);
    }, 0);
}

/**
 * The most rent the user can pay while non-negotiable goals stay on schedule: today's housing
 * payment, plus whatever monthly savings those goals do not need.
 */
export function safeRentThreshold(snapshot: FinancialSnapshot, goals: Goal[]): number {
  const slack = Math.max(0, snapshot.monthlySavingsCents - nonNegotiableMonthlyNeed(snapshot, goals));
  const raw = currentHousingPayment(snapshot) + slack;
  return Math.floor(raw / SAFE_RENT_ROUNDING_CENTS) * SAFE_RENT_ROUNDING_CENTS;
}

export function vehicleFinancing(priceCents: number) {
  // Whole-dollar payment, rounded up, so the card shows clean figures.
  const exact = loanPayment(priceCents, VEHICLE_ANNUAL_RATE, VEHICLE_TERM_MONTHS);
  const monthlyPaymentCents = Math.ceil(exact / 100) * 100;
  return {
    termMonths: VEHICLE_TERM_MONTHS,
    annualRate: VEHICLE_ANNUAL_RATE,
    monthlyPaymentCents,
    totalInterestCents: monthlyPaymentCents * VEHICLE_TERM_MONTHS - priceCents,
  };
}

/**
 * How the purchase enters the simulator. Call this in the route and pass the result to
 * `evaluatePurchase`, so the simulator and the card always describe the same purchase.
 */
export function purchaseForSimulator(
  snapshot: FinancialSnapshot,
  context: CopilotContext,
  goals: Goal[],
): { amountCents: number; monthlyCents: number } {
  switch (context.pageType) {
    case "checkout":
      // Spare cash (checking above the cushion, savings no goal uses) covers the purchase first;
      // only the rest has to be rebuilt from savings before goals see new money.
      return { amountCents: Math.max(0, context.priceCents - spareCash(snapshot, goals)), monthlyCents: 0 };
    case "rental":
      return { amountCents: 0, monthlyCents: context.priceCents - currentHousingPayment(snapshot) };
    case "vehicle_financing":
      return { amountCents: 0, monthlyCents: vehicleFinancing(context.priceCents).monthlyPaymentCents };
    case "debt_payment": {
      // Cash goes out now; afterwards the minimum (if cleared) or the interest saved comes back
      // to savings each month, so the simulator sees a negative monthly cost.
      const plan = debtPaymentPlan(snapshot, context.priceCents);
      if (!plan) return { amountCents: 0, monthlyCents: 0 };
      const monthlyBack = plan.paysOffInFull
        ? plan.freedMonthlyCents
        : Math.round(plan.annualInterestSavedCents / 12);
      return { amountCents: Math.max(0, plan.paidCents - spareCash(snapshot, goals)), monthlyCents: -monthlyBack };
    }
  }
}

/**
 * A credit card payment page carries only the amount (privacy rule), so the payment is matched
 * to the highest-rate card with a balance: the one a payment helps most. Paid from checking.
 */
export function debtPaymentPlan(
  snapshot: FinancialSnapshot,
  priceCents: number,
): CopilotMetrics["debtPayment"] {
  const card = snapshot.accounts
    .filter((a) => a.type === "credit_card" && a.balanceCents > 0 && (a.annualRate ?? 0) > 0)
    .sort((a, b) => (b.annualRate ?? 0) - (a.annualRate ?? 0))[0];
  if (!card) return null;
  const annualRate = card.annualRate ?? 0;
  const paidCents = Math.min(priceCents, card.balanceCents);
  const paysOffInFull = paidCents >= card.balanceCents;
  const wholeDollarsAYear = (cents: number) => Math.round((cents * annualRate) / 100) * 100;
  return {
    accountName: card.name,
    annualRate,
    balanceCents: card.balanceCents,
    paidCents,
    paysOffInFull,
    // Whole dollars: interest avoided over a year on the amount paid.
    annualInterestSavedCents: wholeDollarsAYear(paidCents),
    freedMonthlyCents: paysOffInFull ? (card.minimumPaymentCents ?? 0) : 0,
    remainingCents: card.balanceCents - paidCents,
    checkingAfterCents: checkingBalance(snapshot) - paidCents,
    isMinimumOnly: !paysOffInFull && paidCents <= (card.minimumPaymentCents ?? 0),
    canPayInFull: checkingBalance(snapshot) - card.balanceCents >= snapshot.bufferTargetCents,
    remainingAnnualInterestCents: wholeDollarsAYear(card.balanceCents - paidCents),
    fullAnnualInterestCents: wholeDollarsAYear(card.balanceCents),
  };
}

/**
 * Where a dollar earns the most, best first: paying each debt (a guaranteed return at its rate),
 * investing (the assumed return), and the best savings account (its rate).
 */
export function rankAlternatives(snapshot: FinancialSnapshot): CopilotMetrics["alternatives"] {
  const debts = snapshot.accounts
    .filter((a) => isLiability(a.type) && a.balanceCents > 0 && (a.annualRate ?? 0) > 0)
    .map((a) => ({ kind: "debt" as const, label: a.name, annualRate: a.annualRate ?? 0 }));
  const savings = snapshot.accounts
    .filter((a) => a.type === "savings" && (a.annualRate ?? 0) > 0)
    .sort((a, b) => (b.annualRate ?? 0) - (a.annualRate ?? 0))
    .slice(0, 1)
    .map((a) => ({ kind: "savings" as const, label: a.name, annualRate: a.annualRate ?? 0 }));
  const invest = { kind: "invest" as const, label: "Investing", annualRate: ASSUMED_ANNUAL_RETURN };
  return [...debts, invest, ...savings].sort((a, b) => b.annualRate - a.annualRate);
}

/**
 * Checkout Smart Move: pay from checking down to the buffer target, put the rest on a 0% promo
 * card, and pay it off in equal monthly amounts before the promo ends. Null when checking
 * covers it without dipping under the buffer, or when no promo card works: one whose 0% rate
 * runs at least 2 more months, whose remaining credit (when the bank reports it) fits the
 * amount, and whose monthly payment fits within what the user saves each month.
 */
export function splitPlan(
  snapshot: FinancialSnapshot,
  priceCents: number,
  goals: Goal[],
): CopilotMetrics["splitPlan"] {
  const spare = spareChecking(snapshot);
  if (spare >= priceCents) return null;
  // Spare savings beat borrowing, even at 0%: no split when savings can cover the rest.
  if (spare + spareSavings(snapshot, goals) >= priceCents) return null;

  // Round the checking share down to whole dollars, so the card shows clean figures.
  const fromCheckingCents = Math.floor(spare / 100) * 100;
  const onPromoCardCents = priceCents - fromCheckingCents;
  // Whole-dollar payment, rounded up so the balance clears before the promo ends.
  const paymentFor = (months: number) => Math.ceil(onPromoCardCents / months / 100) * 100;

  const promo = snapshot.accounts
    .filter(
      (a) =>
        a.type === "credit_card" &&
        a.annualRate === 0 &&
        a.promoRateEndsOn !== null &&
        monthsBetween(snapshot.asOf, a.promoRateEndsOn) >= 2 &&
        (a.availableBalanceCents === null || a.availableBalanceCents >= onPromoCardCents) &&
        paymentFor(monthsBetween(snapshot.asOf, a.promoRateEndsOn)) <= snapshot.monthlySavingsCents,
    )
    .sort((a, b) => (b.promoRateEndsOn ?? "").localeCompare(a.promoRateEndsOn ?? ""))[0];
  if (!promo || !promo.promoRateEndsOn) return null;

  const months = monthsBetween(snapshot.asOf, promo.promoRateEndsOn);
  const monthlyPaymentCents = paymentFor(months);
  return {
    fromCheckingCents,
    onPromoCardCents,
    promoCardName: promo.name,
    monthlyPaymentCents,
    payoffMonths: Math.ceil(onPromoCardCents / monthlyPaymentCents),
    promoEndsOn: promo.promoRateEndsOn,
  };
}

/**
 * Picks the goal hit the card leads with. Scores a delay of one month the same as a 10-point
 * drop in odds, and ignores changes below the headline minimums.
 */
export function pickHeadline(goalImpacts: GoalImpact[]): CopilotMetrics["headline"] {
  const none: CopilotMetrics["headline"] = {
    kind: "none",
    goalName: null,
    delayMonths: null,
    oddsBeforeLow: null,
    oddsBeforeHigh: null,
    oddsAfterLow: null,
    oddsAfterHigh: null,
    statusBefore: null,
    statusAfter: null,
  };
  let best: { score: number; headline: CopilotMetrics["headline"] } | null = null;
  let bestGain: { score: number; headline: CopilotMetrics["headline"] } | null = null;

  for (const impact of goalImpacts) {
    const beforeLow = impact.probabilityLowAfter - impact.probabilityLowDelta;
    const beforeHigh = impact.probabilityHighAfter - impact.probabilityHighDelta;
    const drop = -(impact.probabilityLowDelta + impact.probabilityHighDelta) / 2;
    const delay = impact.delayMonths;
    const odds = {
      goalName: impact.goalName,
      oddsBeforeLow: beforeLow,
      oddsBeforeHigh: beforeHigh,
      oddsAfterLow: impact.probabilityLowAfter,
      oddsAfterHigh: impact.probabilityHighAfter,
      statusBefore: goalStatus(beforeLow, beforeHigh),
      statusAfter: goalStatus(impact.probabilityLowAfter, impact.probabilityHighAfter),
    };

    // A goal that was reachable and no longer is beats everything else.
    const wasReachable = beforeHigh >= 0.05;
    const outOfReach =
      wasReachable &&
      ((delay === null && drop > HEADLINE_MIN_ODDS_DROP) ||
        (delay !== null && delay >= OUT_OF_REACH_DELAY_MONTHS));
    if (outOfReach) {
      const score = 1_000 + beforeHigh;
      if (!best || score > best.score) {
        best = { score, headline: { kind: "out_of_reach", delayMonths: delay, ...odds } };
      }
      continue;
    }

    // Improvements: a goal that gets sooner or more likely. Used only when nothing got worse.
    const gainScore = Math.max(
      delay !== null && delay <= -HEADLINE_MIN_DELAY_MONTHS ? -delay * 10 : 0,
      -drop >= HEADLINE_MIN_ODDS_DROP ? -drop * 100 : 0,
    );
    if (gainScore > 0 && (!bestGain || gainScore > bestGain.score)) {
      bestGain = { score: gainScore, headline: { kind: "gain", delayMonths: delay, ...odds } };
    }

    const delayScore = delay !== null && delay >= HEADLINE_MIN_DELAY_MONTHS ? delay * 10 : 0;
    const oddsScore = drop >= HEADLINE_MIN_ODDS_DROP && wasReachable ? drop * 100 : 0;
    // A goal that was already out of reach only headlines when nothing else moved.
    const score = Math.max(delayScore, oddsScore) * (wasReachable ? 1 : 0.01);
    if (score <= 0 || (best && score <= best.score)) continue;
    best = {
      score,
      headline:
        delayScore >= oddsScore
          ? { kind: "delay", delayMonths: delay, ...odds }
          : { kind: "odds", delayMonths: delay, ...odds },
    };
  }
  return best?.headline ?? bestGain?.headline ?? none;
}

const HURTS: ReadonlyArray<CopilotMetrics["headline"]["kind"]> = ["delay", "odds", "out_of_reach"];

/**
 * The card's stance. Caution when a goal or the cash cushion takes a hit; good when the move fits
 * the plan or beats the alternatives; neutral otherwise.
 */
export function pickVerdict(
  context: CopilotContext,
  metrics: Pick<
    CopilotMetrics,
    "headline" | "liquidBufferAfterCents" | "bufferTargetCents" | "safeRentThresholdCents" | "debtPayment" | "transfer"
  >,
): CopilotMetrics["verdict"] {
  const hurts = HURTS.includes(metrics.headline.kind);
  switch (context.pageType) {
    case "checkout": {
      // Judge what this purchase changes. Warn when it drops checking below the cushion (it was at or
      // above before) or below zero, unless moving spare savings in first covers it.
      const after = metrics.liquidBufferAfterCents;
      const afterTransfer = (after ?? 0) + (metrics.transfer?.amountCents ?? 0);
      const before = (after ?? 0) + context.priceCents;
      const underBuffer =
        after !== null &&
        (afterTransfer < 0 || (before >= metrics.bufferTargetCents && afterTransfer < metrics.bufferTargetCents));
      return hurts || underBuffer ? "caution" : "good";
    }
    case "rental": {
      const overSafe =
        metrics.safeRentThresholdCents !== null && context.priceCents > metrics.safeRentThresholdCents;
      return hurts || overSafe ? "caution" : "good";
    }
    case "vehicle_financing":
      return hurts ? "caution" : "neutral";
    case "debt_payment":
      if (!metrics.debtPayment) return "neutral";
      if (hurts) return "caution";
      // Paying only the minimum keeps most of the balance at the card's rate: worth a nudge.
      if (metrics.debtPayment.isMinimumOnly) return "neutral";
      return metrics.debtPayment.annualRate > ASSUMED_ANNUAL_RETURN ? "good" : "neutral";
  }
}

/**
 * The deterministic math core. Runs before any LLM call and produces every figure on a card.
 * `goalImpacts` comes from `evaluatePurchase` in the simulator, fed by `purchaseForSimulator`.
 */
export function computeCopilotMetrics(
  snapshot: FinancialSnapshot,
  context: CopilotContext,
  goalImpacts: GoalImpact[],
  /** Required: goals' savings aren't spare cash, so leaving them out would overstate what's spare. */
  goals: Goal[],
): CopilotMetrics {
  const income = snapshot.monthlyIncomeCents;
  const fixed = snapshot.monthlyFixedCostsCents;
  const cash = liquidCash(snapshot);
  const isRental = context.pageType === "rental";
  const isCheckout = context.pageType === "checkout";
  const isVehicle = context.pageType === "vehicle_financing";
  const isDebt = context.pageType === "debt_payment";

  const vehicle = isVehicle ? vehicleFinancing(context.priceCents) : null;
  const debtPayment = isDebt ? debtPaymentPlan(snapshot, context.priceCents) : null;
  const { monthlyCents } = purchaseForSimulator(snapshot, context, goals);
  // Rent and car payments add to monthly costs; a checkout or a debt payment does not.
  const addedMonthly = isRental || isVehicle ? monthlyCents : 0;
  const cashOut = isCheckout ? context.priceCents : (debtPayment?.paidCents ?? 0);

  const partial = {
    fixedCostRatioBefore: isRental || isVehicle ? fixedCostRatio(fixed, income) : null,
    fixedCostRatioAfter: isRental || isVehicle ? fixedCostRatio(fixed + addedMonthly, income) : null,
    debtToIncomeBefore: vehicle ? debtToIncome(snapshot.monthlyDebtPaymentsCents, income) : null,
    debtToIncomeAfter: vehicle
      ? debtToIncome(snapshot.monthlyDebtPaymentsCents + vehicle.monthlyPaymentCents, income)
      : null,
    runwayDaysBefore: liquidRunwayDays(cash, snapshot.monthlySpendingCents),
    runwayDaysAfter: liquidRunwayDays(cash - cashOut, snapshot.monthlySpendingCents + addedMonthly),
    liquidBufferAfterCents: isCheckout ? checkingBalance(snapshot) - context.priceCents : null,
    bufferTargetCents: snapshot.bufferTargetCents,
    daysUntilPayday: daysBetween(snapshot.asOf, snapshot.nextPaydayOn),
    safeRentThresholdCents: isRental ? safeRentThreshold(snapshot, goals) : null,
    totalCostOfOwnershipCents: vehicle ? context.priceCents + vehicle.totalInterestCents : null,
    opportunityCostCents: isCheckout
      ? opportunityCost(context.priceCents, OPPORTUNITY_HORIZON_YEARS, ASSUMED_ANNUAL_RETURN)
      : null,
    opportunityHorizonYears: isCheckout ? OPPORTUNITY_HORIZON_YEARS : null,
    goalImpacts,
    currentHousingCents: isRental ? currentHousingPayment(snapshot) : null,
    monthlyChangeCents: isRental || isVehicle ? addedMonthly : null,
    vehicle,
    transfer: isCheckout || (isDebt && debtPayment) ? transferPlan(snapshot, goals, cashOut) : null,
    splitPlan: isCheckout ? splitPlan(snapshot, context.priceCents, goals) : null,
    headline: pickHeadline(goalImpacts),
    debtPayment,
    alternatives: rankAlternatives(snapshot),
  };
  return { ...partial, verdict: pickVerdict(context, partial) };
}
