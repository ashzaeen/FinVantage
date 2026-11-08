import {
  CardEvaluatorInputs,
  GrowthCompareInputs,
  formatUsd,
  type AdvisorVisual,
  type AdvisorVisualRequest,
  type CardEvaluator,
  type GoalPlanInputs,
  type GoalPlanVisual,
  type GrowthCompare,
  type LoanExplorer,
  type LoanExplorerInputs,
} from "@finvantage/contracts";
import {
  amortizationByYear,
  applyScenario,
  averageMonthlyOutflow,
  averageSpendByCategory,
  cardValueFigures,
  cutCoverage,
  DTI_GUIDELINE,
  goalPlan,
  growthSeries,
  LOAN_TERM_OPTIONS,
  loanFigures,
  planSpendingCuts,
  savingsPath,
  spendingMonths,
  scenarioCashFigures,
  TYPICAL_LOAN_APR,
} from "@finvantage/math-core";
import { diffOutcomes, simulate } from "@finvantage/simulator";
import type { AppDeps } from "../deps";
import { HttpError } from "../mount";
import { loadInputs } from "../services";
import type { AdvisorReadApi } from "./read-api";

/*
 * The figures behind the Advisor's interactive visuals. The tools call these for the first view,
 * and `POST /v1/advisory/visuals` calls them again when the user moves a slider, so both always
 * agree. Nothing here saves anything.
 */

/** Spending that usually can't go on a credit card: rent or a mortgage, loan payments, and taxes. */
const EXCLUDED_FROM_CARD = new Set(["housing", "debt_payments", "taxes_fees"]);

export interface VisualContext {
  deps: AppDeps;
  userId: string;
  api: AdvisorReadApi;
}

async function simulationInputs(ctx: VisualContext) {
  const inputs = await loadInputs(ctx.deps, ctx.userId, null, { bankCashFlow: true });
  if (!inputs) throw new HttpError(404, "no_data", "Load the demo profile first.");
  return inputs;
}

/** Running total of interest paid, from year 0. */
function interestToDate(schedule: Array<{ year: number; interestCents: number }>) {
  let total = 0;
  return [{ year: 0, cents: 0 }, ...schedule.map((y) => ({ year: y.year, cents: (total += y.interestCents) }))];
}

export async function loanExplorer(ctx: VisualContext, request: LoanExplorerInputs): Promise<LoanExplorer> {
  const inputs = await simulationInputs(ctx);
  const rate = request.aprPercent / 100;
  const down = Math.min(request.downPaymentCents, request.priceCents);
  const figures = loanFigures(request.priceCents, down, rate, request.termMonths);
  const typical = loanFigures(request.priceCents, down, TYPICAL_LOAN_APR, request.termMonths);
  const applied = applyScenario(inputs, [{
    kind: "loan",
    label: request.label,
    priceCents: request.priceCents,
    downPaymentCents: down,
    annualRate: rate,
    termMonths: request.termMonths,
    start: ctx.deps.today(),
  }]);
  const cash = scenarioCashFigures(inputs.snapshot, applied);
  const schedule = amortizationByYear(figures.financedCents, rate, request.termMonths);
  return {
    kind: "loan_explorer",
    inputs: { ...request, downPaymentCents: down },
    ...figures,
    interestShare: figures.totalCostCents > 0 ? figures.totalInterestCents / figures.totalCostCents : 0,
    amortization: schedule,
    interestToDate: interestToDate(schedule),
    terms: LOAN_TERM_OPTIONS.map((termMonths) => {
      const f = loanFigures(request.priceCents, down, rate, termMonths);
      return { termMonths, monthlyPaymentCents: f.monthlyPaymentCents, totalInterestCents: f.totalInterestCents };
    }),
    typical: {
      aprPercent: Math.round(TYPICAL_LOAN_APR * 10_000) / 100,
      monthlyPaymentCents: typical.monthlyPaymentCents,
      totalInterestCents: typical.totalInterestCents,
      interestDifferenceCents: figures.totalInterestCents - typical.totalInterestCents,
      interestToDate: interestToDate(amortizationByYear(typical.financedCents, TYPICAL_LOAN_APR, request.termMonths)),
    },
    debtToIncome: { before: cash.debtToIncomeBefore, after: cash.debtToIncomeAfter, guideline: DTI_GUIDELINE },
    cushion: {
      liquidCashCents: cash.liquidCashCents,
      afterDownPaymentCents: cash.liquidCashAfterUpfrontCents,
      bufferTargetCents: cash.bufferTargetCents,
    },
    monthlySavings: { beforeCents: cash.monthlySavingsBeforeCents, afterCents: cash.monthlySavingsAfterCents },
    goalImpacts: diffOutcomes(inputs.goals, simulate(inputs), simulate(applied.inputs)),
  };
}

export async function goalPlanVisual(ctx: VisualContext, request: GoalPlanInputs): Promise<GoalPlanVisual> {
  const today = ctx.deps.today();
  const [inputs, transactions, categories] = await Promise.all([
    simulationInputs(ctx),
    ctx.api.listTransactions({ query: { limit: 500 } }),
    ctx.api.listSpendingCategories(),
  ]);
  const plan = goalPlan({ targetCents: request.targetCents, currentCents: request.savedCents, targetDate: request.targetDate }, today);
  const applied = applyScenario(inputs, [{
    kind: "new_goal",
    label: request.name,
    targetCents: request.targetCents,
    savedCents: request.savedCents,
    date: request.targetDate,
    flexibility: "flexible",
    priorityRank: request.fundFirst === false ? null : 1,
  }]);
  const after = simulate(applied.inputs);
  const outcome = after.goalOutcomes.find((o) => o.goalId === applied.addedGoalIds[0]) ?? null;

  const labels = new Map(categories.map((c) => [c.id, c.label]));
  const wants = new Set(categories.filter((c) => c.bucket === "wants").map((c) => c.id));
  const window = spendingMonths(transactions, today);
  const flexible = averageSpendByCategory(transactions, window.months).filter((r) => wants.has(r.categoryId));
  const suggested = planSpendingCuts(flexible, plan.monthlyNeededCents).cuts;
  const chosen = new Set(request.selectedCuts ?? suggested.map((c) => c.categoryId));
  const cuts = suggested.map((c) => ({
    categoryId: c.categoryId,
    label: labels.get(c.categoryId) ?? c.categoryId,
    averageMonthlyCents: c.averageMonthlyCents,
    cutCents: c.cutCents,
    selected: chosen.has(c.categoryId),
  }));

  return {
    kind: "goal_plan",
    inputs: request,
    today,
    monthsLeft: plan.monthsLeft,
    monthlyNeededCents: plan.monthlyNeededCents,
    path: savingsPath(request.savedCents, plan.monthlyNeededCents ?? 0, plan.monthsLeft, today),
    fan: outcome?.fan ?? [],
    probabilityLow: outcome?.probabilityLow ?? null,
    probabilityHigh: outcome?.probabilityHigh ?? null,
    otherGoals: diffOutcomes(inputs.goals, simulate(inputs), after),
    currentMonthlySavingsCents: inputs.snapshot.monthlySavingsCents,
    cuts,
    coverage: cutCoverage(cuts.filter((c) => c.selected).map((c) => c.cutCents), plan.monthlyNeededCents),
    cutsBasis: window.basis,
  };
}

export function growthCompare(raw: GrowthCompareInputs): GrowthCompare {
  const request = GrowthCompareInputs.parse(raw);
  return {
    kind: "growth_compare",
    inputs: request,
    series: growthSeries(request.initialCents, request.monthlyCents, request.years, request.rates.map((r) => r.annualReturnPercent / 100)),
  };
}

export async function cardEvaluator(ctx: VisualContext, raw: CardEvaluatorInputs): Promise<CardEvaluator> {
  const request = CardEvaluatorInputs.parse(raw);
  const today = ctx.deps.today();
  const [accounts, transactions, credit, categories] = await Promise.all([
    ctx.api.listAccounts(),
    ctx.api.listTransactions({ query: { limit: 500 } }),
    ctx.api.getCreditScore().catch(() => null),
    ctx.api.listSpendingCategories(),
  ]);
  const cards = accounts.filter((a) => a.type === "credit_card");
  const carriedBalanceCents = cards.reduce((sum, c) => sum + c.balanceCents, 0);
  const { months } = spendingMonths(transactions, today);
  const average = averageMonthlyOutflow(transactions, new Set(cards.map((c) => c.id)), months);
  // With no card purchases on file, size it by everyday spending: what could go on a card.
  const everydayBuckets = new Set(categories.filter((c) => c.bucket === "needs" || c.bucket === "wants").map((c) => c.id));
  const everyday = averageSpendByCategory(transactions, months)
    .filter((r) => everydayBuckets.has(r.categoryId) && !EXCLUDED_FROM_CARD.has(r.categoryId))
    .reduce((sum, r) => sum + r.averageMonthlyCents, 0);
  const spendBasis = average > 0 ? "cards" as const : "everyday" as const;
  const defaultMonthlySpendCents = average > 0 ? average : everyday;
  const monthlySpendCents = request.monthlySpendCents ?? defaultMonthlySpendCents;
  const figures = cardValueFigures({
    monthlySpendCents,
    rewardsRate: request.rewardsPercent / 100,
    annualFeeCents: request.annualFeeCents,
    aprRate: request.aprPercent / 100,
    carriedBalanceCents,
    paysInFull: request.paysInFull,
  });
  const highest = [...cards].sort((a, b) => (b.annualRate ?? 0) - (a.annualRate ?? 0))[0];

  const checks: CardEvaluator["checks"] = [
    request.annualFeeCents === 0
      ? { label: "No Annual Fee", status: "good", detail: "Every reward you earn is yours to keep." }
      : figures.rewardsBeatFee
        ? { label: "Rewards Cover the Fee", status: "good", detail: `${formatUsd(figures.annualRewardsCents)} in rewards against a ${formatUsd(request.annualFeeCents)} fee.` }
        : { label: "Fee Outweighs Rewards", status: "warning", detail: `${formatUsd(figures.annualRewardsCents)} in rewards against a ${formatUsd(request.annualFeeCents)} fee at this spending.` },
    carriedBalanceCents > 0
      ? {
          label: "You Carry Card Debt",
          status: carriedBalanceCents * (request.aprPercent / 100) > figures.annualRewardsCents ? "critical" : "warning",
          detail: `${formatUsd(carriedBalanceCents)} on your cards now${highest?.annualRate ? `, up to ${Math.round(highest.annualRate * 10_000) / 100}% APR` : ""}. Interest on a carried balance usually costs more than rewards earn.`,
        }
      : { label: "No Card Balance", status: "good", detail: "You don't carry card debt, so rewards are pure upside." },
    { label: "Interest Rate", status: request.aprPercent >= 20 ? "warning" : "info", detail: `${request.aprPercent}% APR applies to anything not paid in full.` },
  ];

  return {
    kind: "card_evaluator",
    inputs: request,
    averageMonthlyCardSpendCents: average,
    spendBasis,
    defaultMonthlySpendCents,
    monthlySpendCents,
    figures,
    carriedBalanceCents,
    cards: cards.map((c) => ({ name: c.name, aprPercent: c.annualRate === null || c.annualRate === undefined ? null : Math.round(c.annualRate * 10_000) / 100, balanceCents: c.balanceCents })),
    checks,
    creditScore: credit ? { score: credit.score, mocked: true } : null,
  };
}

/** Builds any visual from its inputs. The route and the tools both come through here. */
export async function buildVisual(ctx: VisualContext, request: AdvisorVisualRequest): Promise<AdvisorVisual> {
  switch (request.kind) {
    case "loan_explorer":
      return loanExplorer(ctx, request.inputs);
    case "goal_plan":
      return goalPlanVisual(ctx, request.inputs);
    case "growth_compare":
      return growthCompare(request.inputs);
    case "card_evaluator":
      return cardEvaluator(ctx, request.inputs);
  }
}
