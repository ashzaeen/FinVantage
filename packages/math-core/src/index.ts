import {
  isLiability,
  type CopilotContext,
  type CopilotMetrics,
  type FinancialSnapshot,
  type GoalImpact,
} from "@finvantage/contracts";

// STUB(copilot-backend): naive formulas so the pipeline runs end to end. Review each one.

const OPPORTUNITY_HORIZON_YEARS = 10;
const ASSUMED_ANNUAL_RETURN = 0.07;
const SAFE_FIXED_COST_RATIO = 0.5;
const MS_PER_DAY = 86_400_000;

export function fixedCostRatio(monthlyFixedCents: number, monthlyIncomeCents: number): number {
  return monthlyIncomeCents > 0 ? monthlyFixedCents / monthlyIncomeCents : 0;
}

export function debtToIncome(monthlyDebtCents: number, monthlyIncomeCents: number): number {
  return monthlyIncomeCents > 0 ? monthlyDebtCents / monthlyIncomeCents : 0;
}

/** Liquid runway: cash divided by daily burn. */
export function liquidRunwayDays(cashCents: number, monthlySpendingCents: number): number {
  const dailyBurn = monthlySpendingCents / 30;
  return dailyBurn > 0 ? Math.floor(cashCents / dailyBurn) : 0;
}

export function opportunityCost(amountCents: number, years: number, annualReturn: number): number {
  return Math.round(amountCents * (1 + annualReturn) ** years) - amountCents;
}

export function safeRentThreshold(snapshot: FinancialSnapshot, currentHousingCents: number): number {
  const otherFixed = snapshot.monthlyFixedCostsCents - currentHousingCents;
  return Math.max(0, Math.round(snapshot.monthlyIncomeCents * SAFE_FIXED_COST_RATIO - otherFixed));
}

export function liquidCash(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => a.type === "checking" || a.type === "savings")
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

export function checkingBalance(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => a.type === "checking")
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

export function totalDebt(snapshot: FinancialSnapshot): number {
  return snapshot.accounts
    .filter((a) => isLiability(a.type))
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY);
}

/**
 * The deterministic math core. Runs before any LLM call and produces every figure on a card.
 * `goalImpacts` comes from `evaluatePurchase` in the simulator.
 */
export function computeCopilotMetrics(
  snapshot: FinancialSnapshot,
  context: CopilotContext,
  goalImpacts: GoalImpact[],
): CopilotMetrics {
  const income = snapshot.monthlyIncomeCents;
  const fixed = snapshot.monthlyFixedCostsCents;
  const cash = liquidCash(snapshot);
  const isMonthly = context.pageType === "rental";
  const isOneTime = context.pageType === "checkout";
  const isVehicle = context.pageType === "vehicle_financing";

  // STUB(copilot-backend): the context carries no loan term, so 60 months is assumed.
  const vehicleMonthly = isVehicle ? Math.round(context.priceCents / 60) : 0;
  const addedMonthly = isMonthly ? context.priceCents : vehicleMonthly;

  return {
    fixedCostRatioBefore: isOneTime ? null : fixedCostRatio(fixed, income),
    fixedCostRatioAfter: isOneTime ? null : fixedCostRatio(fixed + addedMonthly, income),
    debtToIncomeBefore: isVehicle ? debtToIncome(snapshot.monthlyDebtPaymentsCents, income) : null,
    debtToIncomeAfter: isVehicle
      ? debtToIncome(snapshot.monthlyDebtPaymentsCents + vehicleMonthly, income)
      : null,
    runwayDaysBefore: liquidRunwayDays(cash, snapshot.monthlySpendingCents),
    runwayDaysAfter: liquidRunwayDays(
      isOneTime ? cash - context.priceCents : cash,
      snapshot.monthlySpendingCents + addedMonthly,
    ),
    liquidBufferAfterCents: isOneTime ? checkingBalance(snapshot) - context.priceCents : null,
    bufferTargetCents: snapshot.bufferTargetCents,
    daysUntilPayday: daysBetween(snapshot.asOf, snapshot.nextPaydayOn),
    safeRentThresholdCents: isMonthly ? safeRentThreshold(snapshot, 0) : null,
    totalCostOfOwnershipCents: isVehicle ? context.priceCents : null,
    opportunityCostCents: isOneTime
      ? opportunityCost(context.priceCents, OPPORTUNITY_HORIZON_YEARS, ASSUMED_ANNUAL_RETURN)
      : null,
    opportunityHorizonYears: isOneTime ? OPPORTUNITY_HORIZON_YEARS : null,
    goalImpacts,
  };
}
