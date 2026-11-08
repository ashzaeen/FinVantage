import type { FinancialSnapshot, Goal, LifeEvent, SimulationInputs, Transaction } from "@finvantage/contracts";
import { debtToIncome, liquidCash, liquidRunwayDays, loanPayment, monthlyDebtPayments } from "./index";

/*
 * Figures the Advisor's tools compute, so the model can recommend amounts it never works out
 * itself. Pure functions: the same inputs always give the same figures.
 */

/** A cut is never more than this share of what a category usually costs, so options stay realistic. */
export const MAX_CATEGORY_CUT_SHARE = 0.5;
/** Without a target amount, suggest trimming the biggest flexible categories by this share. */
export const DEFAULT_CATEGORY_CUT_SHARE = 0.25;
/** Suggested cuts are rounded up to this step, so they read like a real budget line. */
export const CUT_ROUNDING_CENTS = 500;
/** Full months averaged to find what a category usually costs. */
export const SPENDING_AVERAGE_MONTHS = 3;

/** Whole months from one date to another, counting a partial month as a month. Zero if past. */
export function monthsUntil(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split("-").map(Number) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm) + (td > fd ? 1 : 0);
  return Math.max(0, months);
}

export interface GoalPlan {
  gapCents: number;
  monthsLeft: number;
  /** What it takes each month to close the gap by the target date. Null once the date has passed. */
  monthlyNeededCents: number | null;
}

/** The plain arithmetic of a goal: how far it is, how long is left, and the monthly amount. */
export function goalPlan(goal: Pick<Goal, "targetCents" | "currentCents" | "targetDate">, todayIso: string): GoalPlan {
  const gapCents = Math.max(0, goal.targetCents - goal.currentCents);
  const monthsLeft = monthsUntil(todayIso, goal.targetDate);
  return {
    gapCents,
    monthsLeft,
    monthlyNeededCents: gapCents === 0 ? 0 : monthsLeft > 0 ? Math.ceil(gapCents / monthsLeft) : null,
  };
}

/** The `count` full months before `todayIso`'s month, oldest first, as "YYYY-MM". */
export function fullMonthsBefore(todayIso: string, count: number): string[] {
  const [y, m] = todayIso.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const index = y * 12 + (m - 1) - (count - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

export interface CategoryAverage {
  categoryId: string;
  averageMonthlyCents: number;
}

/** What each category costs in an average month over `months`, biggest first. Money out only. */
export function averageSpendByCategory(transactions: Transaction[], months: string[]): CategoryAverage[] {
  const inWindow = new Set(months);
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.amountCents >= 0 || !t.category || !inWindow.has(t.date.slice(0, 7))) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amountCents);
  }
  return [...totals]
    .map(([categoryId, total]) => ({ categoryId, averageMonthlyCents: Math.round(total / Math.max(1, months.length)) }))
    .sort((a, b) => b.averageMonthlyCents - a.averageMonthlyCents);
}

export interface SpendingCut {
  categoryId: string;
  averageMonthlyCents: number;
  cutCents: number;
  newMonthlyCents: number;
}

export interface SpendingCutPlan {
  cuts: SpendingCut[];
  totalCutCents: number;
  /** Null without a target. False when even the largest realistic cuts fall short. */
  coversTarget: boolean | null;
  shortfallCents: number;
}

const roundUp = (cents: number) => Math.ceil(cents / CUT_ROUNDING_CENTS) * CUT_ROUNDING_CENTS;

/**
 * Where a monthly amount could come from, taken from the biggest flexible categories first and
 * never more than half of any one. Without a target, trims the top three by a quarter.
 */
export function planSpendingCuts(flexible: CategoryAverage[], targetCents: number | null): SpendingCutPlan {
  const cuts: SpendingCut[] = [];
  let remaining = targetCents ?? Infinity;
  const candidates = targetCents === null ? flexible.slice(0, 3) : flexible;
  for (const row of candidates) {
    if (remaining <= 0 || row.averageMonthlyCents <= 0) continue;
    const share = targetCents === null ? DEFAULT_CATEGORY_CUT_SHARE : MAX_CATEGORY_CUT_SHARE;
    const cap = Math.floor(row.averageMonthlyCents * share);
    const cutCents = Math.min(cap, roundUp(Math.min(remaining, cap)));
    if (cutCents <= 0) continue;
    cuts.push({ ...row, cutCents, newMonthlyCents: row.averageMonthlyCents - cutCents });
    remaining -= cutCents;
  }
  const totalCutCents = cuts.reduce((sum, c) => sum + c.cutCents, 0);
  return {
    cuts,
    totalCutCents,
    coversTarget: targetCents === null ? null : totalCutCents >= targetCents,
    shortfallCents: targetCents === null ? 0 : Math.max(0, targetCents - totalCutCents),
  };
}

/**
 * Arithmetic for the Advisor's calculator: numbers, + - * / %, parentheses, and unary minus.
 * A hand-written parser, never `eval`. Throws on anything else, or on dividing by zero.
 */
export function evaluateExpression(expression: string): number {
  if (expression.length > 200) throw new Error("Expression is too long.");
  const tokens = expression.replace(/,/g, "").match(/\d+(?:\.\d+)?|\.\d+|[-+*/%()]|\S/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];

  function primary(): number {
    const token = take();
    if (token === undefined) throw new Error("Expression ended early.");
    if (token === "(") {
      const value = sum();
      if (take() !== ")") throw new Error("Missing closing parenthesis.");
      return value;
    }
    if (token === "-") return -primary();
    if (token === "+") return primary();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error(`Unexpected "${token}".`);
    return value;
  }

  function product(): number {
    let value = primary();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = take();
      const right = primary();
      if (op !== "*" && right === 0) throw new Error("Division by zero.");
      value = op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  }

  function sum(): number {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      value = take() === "+" ? value + product() : value - product();
    }
    return value;
  }

  const result = sum();
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i]}".`);
  if (!Number.isFinite(result)) throw new Error("Result is not a number.");
  return result;
}

/** The numbers an expression is built from, so the caller can check each one is real. */
export function expressionNumbers(expression: string): number[] {
  return (expression.replace(/,/g, "").match(/\d+(?:\.\d+)?|\.\d+/g) ?? []).map(Number);
}

// ---------- Finance formulas ----------

/**
 * Fallback returns for a growth projection, used only when the user gives no rate and no web
 * search found one: cautious, middle, and strong. Always labeled as assumed.
 */
export const GROWTH_RETURN_LOW = 0.04;
export const GROWTH_RETURN_TYPICAL = 0.07;
export const GROWTH_RETURN_HIGH = 0.1;
export const FALLBACK_GROWTH_RATES = [
  { label: "Cautious (assumed)", annualReturn: GROWTH_RETURN_LOW },
  { label: "Middle (assumed)", annualReturn: GROWTH_RETURN_TYPICAL },
  { label: "Strong (assumed)", annualReturn: GROWTH_RETURN_HIGH },
] as const;
/** A loan term to assume, and say so, when the user gives none. */
export const DEFAULT_LOAN_TERM_MONTHS = 60;

export interface LoanFigures {
  financedCents: number;
  monthlyPaymentCents: number;
  totalPaidCents: number;
  totalInterestCents: number;
  /** Down payment plus every payment. */
  totalCostCents: number;
}

/** An amortized loan: what is borrowed after the down payment, the payment, and what it all costs. */
export function loanFigures(priceCents: number, downPaymentCents: number, annualRate: number, termMonths: number): LoanFigures {
  const financedCents = Math.max(0, priceCents - downPaymentCents);
  const monthlyPaymentCents = loanPayment(financedCents, annualRate, termMonths);
  const totalPaidCents = monthlyPaymentCents * Math.max(1, termMonths);
  return {
    financedCents,
    monthlyPaymentCents,
    totalPaidCents,
    totalInterestCents: Math.max(0, totalPaidCents - financedCents),
    totalCostCents: totalPaidCents + downPaymentCents,
  };
}

/** Future value of a lump sum plus monthly contributions, compounded monthly. */
export function futureValue(initialCents: number, monthlyCents: number, annualReturn: number, months: number): number {
  const r = annualReturn / 12;
  if (r === 0) return Math.round(initialCents + monthlyCents * months);
  const growth = (1 + r) ** months;
  return Math.round(initialCents * growth + monthlyCents * ((growth - 1) / r));
}

export interface GrowthRange {
  contributedCents: number;
  lowCents: number;
  typicalCents: number;
  highCents: number;
  returns: { low: number; typical: number; high: number };
}

/** What money could grow to, as a range across three named return assumptions. Not a forecast. */
export function growthRange(initialCents: number, monthlyCents: number, years: number): GrowthRange {
  const months = Math.round(years * 12);
  return {
    contributedCents: initialCents + monthlyCents * months,
    lowCents: futureValue(initialCents, monthlyCents, GROWTH_RETURN_LOW, months),
    typicalCents: futureValue(initialCents, monthlyCents, GROWTH_RETURN_TYPICAL, months),
    highCents: futureValue(initialCents, monthlyCents, GROWTH_RETURN_HIGH, months),
    returns: { low: GROWTH_RETURN_LOW, typical: GROWTH_RETURN_TYPICAL, high: GROWTH_RETURN_HIGH },
  };
}

export interface PayoffFigures {
  /** Null when the payment never covers the interest. */
  months: number | null;
  totalInterestCents: number | null;
  monthlyInterestNowCents: number;
}

/** How long a balance takes to pay off at a fixed monthly payment, and the interest along the way. */
export function payoffFigures(balanceCents: number, annualRate: number, monthlyPaymentCents: number): PayoffFigures {
  const r = annualRate / 12;
  const monthlyInterestNowCents = Math.round(balanceCents * r);
  if (monthlyPaymentCents <= monthlyInterestNowCents) return { months: null, totalInterestCents: null, monthlyInterestNowCents };
  let balance = balanceCents;
  let interest = 0;
  let months = 0;
  while (balance > 0 && months < 1200) {
    const charge = Math.round(balance * r);
    interest += charge;
    balance = balance + charge - monthlyPaymentCents;
    months++;
  }
  return { months, totalInterestCents: interest, monthlyInterestNowCents };
}

/** The monthly amount that reaches a target in `months`, with an optional return on what is saved. */
export function monthlyToReach(targetCents: number, currentCents: number, months: number, annualReturn = 0): number | null {
  if (months <= 0) return null;
  const r = annualReturn / 12;
  const grown = currentCents * (1 + r) ** months;
  const gap = targetCents - grown;
  if (gap <= 0) return 0;
  return Math.ceil(r === 0 ? gap / months : (gap * r) / ((1 + r) ** months - 1));
}

/** Months until monthly saving reaches a target. Null when the monthly amount is zero or less. */
export function monthsToReach(targetCents: number, currentCents: number, monthlyCents: number): number | null {
  const gap = targetCents - currentCents;
  if (gap <= 0) return 0;
  return monthlyCents > 0 ? Math.ceil(gap / monthlyCents) : null;
}

/** An ISO date `months` after another, clamped to the month's last day. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

// ---------- Scenarios ----------

/**
 * One change in a what-if scenario. Money is in cents: negative costs money, positive adds it.
 * The Advisor combines these to model almost any decision: a trip, a car loan, a new job, a move.
 */
export type ScenarioChange =
  | { kind: "one_time"; label: string; amountCents: number; date: string }
  | { kind: "monthly"; label: string; amountCents: number; start: string; months: number | null }
  | { kind: "loan"; label: string; priceCents: number; downPaymentCents: number; annualRate: number; termMonths: number; start: string }
  | { kind: "savings_change"; label: string; monthlyCents: number }
  | { kind: "new_goal"; label: string; targetCents: number; savedCents: number; date: string; flexibility: Goal["flexibility"]; priorityRank: number | null }
  | { kind: "shift_goal"; label: string; goalId: string; months: number };

export interface AppliedScenario {
  inputs: SimulationInputs;
  /** Ids of goals the scenario added, so their odds can be read from the result. */
  addedGoalIds: string[];
  loans: Array<{ label: string } & LoanFigures>;
  /** Monthly change to savings from monthly changes, loans, and savings changes. */
  monthlyChangeCents: number;
  /** One-time costs and down payments within the next three months. */
  upfrontCostCents: number;
}

/** How far ahead a one-time cost counts as "upfront" for the cash cushion. */
export const UPFRONT_WINDOW_MONTHS = 3;

/**
 * Turns a scenario into simulator inputs: one-time and monthly changes become unsaved life events,
 * a loan becomes its down payment plus monthly payments, and goals are added or moved. The
 * simulator only reads an event's date, amount, recurrence, duration, and linked goal.
 */
export function applyScenario(inputs: SimulationInputs, changes: ScenarioChange[]): AppliedScenario {
  const asOf = inputs.snapshot.asOf;
  const upfrontBy = addMonthsIso(asOf, UPFRONT_WINDOW_MONTHS);
  const lifeEvents = [...inputs.lifeEvents];
  let goals = [...inputs.goals];
  const addedGoalIds: string[] = [];
  const loans: AppliedScenario["loans"] = [];
  let savingsDelta = inputs.whatIf?.monthlySavingsDeltaCents ?? 0;
  let monthlyChangeCents = 0;
  let upfrontCostCents = 0;
  const userId = goals[0]?.userId ?? "scenario";

  const event = (id: string, draft: Pick<LifeEvent, "date" | "recurrence" | "dollarImpactCents" | "durationMonths">): LifeEvent => ({
    ...draft,
    id,
    userId,
    // The engine ignores the type; these events are never saved.
    type: "move",
    linkedGoalId: null,
    source: "form",
  });

  changes.forEach((change, i) => {
    switch (change.kind) {
      case "one_time":
        lifeEvents.push(event(`scenario-${i}`, { date: change.date, recurrence: "one_time", dollarImpactCents: change.amountCents, durationMonths: null }));
        if (change.amountCents < 0 && change.date <= upfrontBy) upfrontCostCents -= change.amountCents;
        break;
      case "monthly":
        lifeEvents.push(event(`scenario-${i}`, { date: change.start, recurrence: "recurring", dollarImpactCents: change.amountCents, durationMonths: change.months }));
        monthlyChangeCents += change.amountCents;
        break;
      case "loan": {
        const figures = loanFigures(change.priceCents, change.downPaymentCents, change.annualRate, change.termMonths);
        loans.push({ label: change.label, ...figures });
        if (change.downPaymentCents > 0) {
          lifeEvents.push(event(`scenario-${i}-down`, { date: change.start, recurrence: "one_time", dollarImpactCents: -change.downPaymentCents, durationMonths: null }));
          if (change.start <= upfrontBy) upfrontCostCents += change.downPaymentCents;
        }
        lifeEvents.push(event(`scenario-${i}-payment`, { date: change.start, recurrence: "recurring", dollarImpactCents: -figures.monthlyPaymentCents, durationMonths: change.termMonths }));
        monthlyChangeCents -= figures.monthlyPaymentCents;
        break;
      }
      case "savings_change":
        savingsDelta += change.monthlyCents;
        monthlyChangeCents += change.monthlyCents;
        break;
      case "new_goal": {
        const id = `scenario-goal-${i}`;
        addedGoalIds.push(id);
        const lowest = goals.reduce((max, g) => Math.max(max, g.priorityRank), 0);
        const rank = Math.min(change.priorityRank ?? lowest + 1, lowest + 1);
        // Goals at or below the new rank move down one, as when a user inserts a goal.
        goals = goals.map((g) => (g.priorityRank >= rank ? { ...g, priorityRank: g.priorityRank + 1 } : g));
        goals.push({
          id,
          userId,
          name: change.label,
          targetCents: change.targetCents,
          currentCents: change.savedCents,
          targetDate: change.date,
          priorityRank: rank,
          flexibility: change.flexibility,
          linkedAccountId: null,
        });
        break;
      }
      case "shift_goal":
        goals = goals.map((g) => (g.id === change.goalId ? { ...g, targetDate: addMonthsIso(g.targetDate, change.months) } : g));
        break;
    }
  });

  return {
    inputs: {
      ...inputs,
      goals,
      lifeEvents,
      whatIf: {
        monthlySavingsDeltaCents: savingsDelta,
        purchaseAmountCents: inputs.whatIf?.purchaseAmountCents ?? 0,
        eventShifts: inputs.whatIf?.eventShifts ?? [],
      },
    },
    addedGoalIds,
    loans,
    monthlyChangeCents,
    upfrontCostCents,
  };
}

export interface ScenarioCashFigures {
  monthlySavingsBeforeCents: number;
  monthlySavingsAfterCents: number;
  debtToIncomeBefore: number;
  debtToIncomeAfter: number;
  liquidCashCents: number;
  liquidCashAfterUpfrontCents: number;
  bufferTargetCents: number;
  runwayDaysBefore: number;
  runwayDaysAfter: number;
}

/** The cash side of a scenario: monthly savings, debt load, and the cushion after upfront costs. */
export function scenarioCashFigures(snapshot: FinancialSnapshot, applied: AppliedScenario): ScenarioCashFigures {
  const income = snapshot.monthlyIncomeCents;
  const debt = monthlyDebtPayments(snapshot);
  const newDebt = applied.loans.reduce((sum, l) => sum + l.monthlyPaymentCents, 0);
  const cash = liquidCash(snapshot);
  const cashAfter = cash - applied.upfrontCostCents;
  const spendingAfter = snapshot.monthlySpendingCents + Math.max(0, -applied.monthlyChangeCents);
  return {
    monthlySavingsBeforeCents: snapshot.monthlySavingsCents,
    monthlySavingsAfterCents: snapshot.monthlySavingsCents + applied.monthlyChangeCents,
    debtToIncomeBefore: debtToIncome(debt, income),
    debtToIncomeAfter: debtToIncome(debt + newDebt, income),
    liquidCashCents: cash,
    liquidCashAfterUpfrontCents: cashAfter,
    bufferTargetCents: snapshot.bufferTargetCents,
    runwayDaysBefore: liquidRunwayDays(cash, snapshot.monthlySpendingCents),
    runwayDaysAfter: liquidRunwayDays(Math.max(0, cashAfter), spendingAfter),
  };
}

// ---------- Figures for the Advisor's interactive visuals ----------

/** Loan terms the loan explorer compares side by side. */
export const LOAN_TERM_OPTIONS = [36, 48, 60, 72] as const;
/** The car-loan rate the explorer compares against: the Copilot's typical financing rate. */
export const TYPICAL_LOAN_APR = 0.07;
/** A common lender guideline: debt payments under this share of income. */
export const DTI_GUIDELINE = 0.36;

export interface AmortizationYear {
  year: number;
  principalCents: number;
  interestCents: number;
  /** What is still owed at the end of the year. */
  balanceCents: number;
}

/** A loan's principal and interest paid in each year, and the balance left at each year's end. */
export function amortizationByYear(financedCents: number, annualRate: number, termMonths: number): AmortizationYear[] {
  const payment = loanPayment(financedCents, annualRate, termMonths);
  const r = annualRate / 12;
  const years: AmortizationYear[] = [];
  let balance = financedCents;
  for (let month = 1; month <= termMonths && balance > 0; month++) {
    const interest = Math.round(balance * r);
    const principal = Math.min(balance, payment - interest);
    balance -= principal;
    const year = Math.ceil(month / 12);
    const row = years[year - 1] ?? (years[year - 1] = { year, principalCents: 0, interestCents: 0, balanceCents: 0 });
    row.principalCents += principal;
    row.interestCents += interest;
    row.balanceCents = Math.max(0, balance);
  }
  return years;
}

export interface GrowthPoint {
  year: number;
  contributedCents: number;
  /** One value per rate, in the order the rates were given. */
  valuesCents: number[];
}

/** Year-by-year growth at each given annual return, from year 0. */
export function growthSeries(initialCents: number, monthlyCents: number, years: number, annualReturns: number[]): GrowthPoint[] {
  const whole = Math.max(1, Math.round(years));
  return Array.from({ length: whole + 1 }, (_, year) => ({
    year,
    contributedCents: initialCents + monthlyCents * year * 12,
    valuesCents: annualReturns.map((r) => futureValue(initialCents, monthlyCents, r, year * 12)),
  }));
}

/** Month-by-month balance on a straight savings plan, from today to the target date. */
export function savingsPath(savedCents: number, monthlyCents: number, months: number, startIso: string): Array<{ date: string; savedCents: number }> {
  return Array.from({ length: Math.max(0, months) + 1 }, (_, m) => ({
    date: addMonthsIso(startIso, m),
    savedCents: savedCents + monthlyCents * m,
  }));
}

/** How much of a monthly need the chosen cuts cover, from 0 to 1. */
export function cutCoverage(cutCents: number[], monthlyNeededCents: number | null): { coveredCents: number; share: number | null } {
  const coveredCents = cutCents.reduce((sum, c) => sum + c, 0);
  if (!monthlyNeededCents || monthlyNeededCents <= 0) return { coveredCents, share: null };
  return { coveredCents, share: Math.min(1, coveredCents / monthlyNeededCents) };
}

/** Average monthly money out of the given accounts over `months`, for spending on a card. */
export function averageMonthlyOutflow(transactions: Transaction[], accountIds: Set<string>, months: string[]): number {
  const inWindow = new Set(months);
  const total = transactions
    .filter((t) => t.amountCents < 0 && accountIds.has(t.accountId) && inWindow.has(t.date.slice(0, 7)))
    .reduce((sum, t) => sum - t.amountCents, 0);
  return Math.round(total / Math.max(1, months.length));
}

export interface CardValueFigures {
  annualSpendCents: number;
  annualRewardsCents: number;
  annualFeeCents: number;
  /** Interest a year on the balance carried, when the card is not paid in full. */
  annualInterestCents: number;
  /** Rewards minus the fee and any interest. Negative means the card costs money. */
  netCents: number;
  /** Rewards cover the fee. */
  rewardsBeatFee: boolean;
}

/** What a rewards card is worth in a year for this spending, with or without carrying a balance. */
export function cardValueFigures(input: {
  monthlySpendCents: number;
  rewardsRate: number;
  annualFeeCents: number;
  aprRate: number;
  carriedBalanceCents: number;
  paysInFull: boolean;
}): CardValueFigures {
  const annualSpendCents = input.monthlySpendCents * 12;
  const annualRewardsCents = Math.round(annualSpendCents * input.rewardsRate);
  const annualInterestCents = input.paysInFull ? 0 : Math.round(input.carriedBalanceCents * input.aprRate);
  return {
    annualSpendCents,
    annualRewardsCents,
    annualFeeCents: input.annualFeeCents,
    annualInterestCents,
    netCents: annualRewardsCents - input.annualFeeCents - annualInterestCents,
    rewardsBeatFee: annualRewardsCents >= input.annualFeeCents,
  };
}

/**
 * The months to average spending over: the last full months, or this month so far when those
 * hold no spending (a new or sparse account). Returns which, so callers can say so.
 */
export function spendingMonths(transactions: Transaction[], todayIso: string): { months: string[]; basis: "full_months" | "this_month" } {
  const full = fullMonthsBefore(todayIso, SPENDING_AVERAGE_MONTHS);
  const window = new Set(full);
  const hasHistory = transactions.some((t) => t.amountCents < 0 && window.has(t.date.slice(0, 7)));
  return hasHistory ? { months: full, basis: "full_months" } : { months: [todayIso.slice(0, 7)], basis: "this_month" };
}
