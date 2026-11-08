import {
  formatUsd,
  type LifeScenarioAnalyzeRequest,
  type LifeScenarioAnalysis,
  type LifeScenarioGoalInput,
  type LifeScenarioOption,
} from "@finvantage/contracts";
import { monthsBetween } from "./dates";

/*
 * The life simulator's funding engine: given a set of goals, an event (a monthly cost, a
 * one-time cost, and a date it starts), and a post-event contribution split, this works out when
 * each goal gets funded, before and after the event, and what each "get back on track" option
 * does to the goal marked `kind: "trip"`.
 *
 * Pure and deterministic: no I/O, no clock (the caller passes `asOf`), no LLM. Mirrors the rules
 * in `packages/math-core/AGENTS.md`.
 */

const SAVE_MORE_CENTS = 15_000;
const REDUCE_ONE_TIME_CENTS = 60_000;
/** Funding runs are capped here so a goal that is badly underfunded returns "not funded" instead
 * of looping forever; the fixture's longest real delay (Home Down Payment, 4 years) is well inside it. */
const MAX_MONTHS = 600;
/** Chart series are capped separately and shorter than MAX_MONTHS: a 50-year line chart isn't useful. */
const MAX_SERIES_MONTHS = 180;

export class LifeScenarioValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function monthNumber(date: string): number {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return year! * 12 + month! - 1;
}

function monthDate(month: number): string {
  const year = Math.floor(month / 12);
  const monthOfYear = (month % 12) + 1;
  return `${year}-${String(monthOfYear).padStart(2, "0")}-01`;
}

function differenceInMonths(from: string, to: string): number {
  return monthsBetween(from, to);
}

function delayLabel(months: number | null): string {
  if (months === null) return "Not Funded";
  if (months === 0) return "On Time";
  const direction = months > 0 ? "later" : "earlier";
  const absolute = Math.abs(months);
  if (absolute < 24) return `${absolute} month${absolute === 1 ? "" : "s"} ${direction}`;
  const years = Math.floor(absolute / 12);
  const remainingMonths = absolute % 12;
  const duration = remainingMonths ? `${years} years ${remainingMonths} months` : `${years} years`;
  return `${duration} ${direction}`;
}

type FundingEvent = { due: number; hitCents: number; postMonthlyCents: number };

/** Steps one month at a time so a one-time cost can reduce an already-funded balance back down. */
function runFunding(
  startMonth: number,
  balanceCents: number,
  targetCents: number,
  monthlyCents: number,
  event?: FundingEvent,
): { fundedMonth: number | null; series: Array<{ month: string; balanceCents: number }> } {
  let balance = balanceCents;
  // No pre-loop check: with an event active, a goal can only finish on or after its due month even
  // if it was already funded before the event — the in-loop `month >= event.due` gate enforces this.
  // Without an event, the same gate (`!event`) lets an already-funded goal finish at `startMonth`.
  let fundedMonth: number | null = null;
  const series: Array<{ month: string; balanceCents: number }> = [];
  for (let offset = 0; offset < MAX_MONTHS; offset += 1) {
    const month = startMonth + offset;
    if (event && month === event.due) balance = Math.max(0, balance - event.hitCents);
    const contribution = event && month >= event.due ? event.postMonthlyCents : monthlyCents;
    balance += Math.max(0, Math.min(contribution, targetCents - balance));
    if (offset < MAX_SERIES_MONTHS) series.push({ month: monthDate(month), balanceCents: balance });
    if (fundedMonth === null && balance >= targetCents && (!event || month >= event.due)) fundedMonth = month;
    if (fundedMonth !== null && offset >= MAX_SERIES_MONTHS) break;
  }
  return { fundedMonth, series };
}

function optionAdjustments(option: LifeScenarioOption) {
  return {
    extraSavedPerMonthCents: option === "save_more" || option === "both" ? SAVE_MORE_CENTS : 0,
    costReductionCents: option === "reduce_one_time" || option === "both" ? REDUCE_ONE_TIME_CENTS : 0,
  };
}

/** The split must cover included goals and not outrun free cash, unless the caller opts in. */
function validate(input: LifeScenarioAnalyzeRequest): void {
  const eventMonth = monthNumber(input.startMonth);
  const asOfMonth = monthNumber(input.asOf);
  if (eventMonth <= asOfMonth) {
    throw new LifeScenarioValidationError("event_not_future", "The event month must be after the current month.");
  }
  const goalIds = new Set(input.goals.map((goal) => goal.id));
  if (!goalIds.has(input.oneTimeSourceGoalId)) {
    throw new LifeScenarioValidationError("unknown_goal", "oneTimeSourceGoalId must be one of the included goals.");
  }
  for (const id of input.selectedGoalIds) {
    if (!goalIds.has(id)) throw new LifeScenarioValidationError("unknown_goal", `Unknown goal id in selectedGoalIds: ${id}`);
  }
  if (!input.allowOverCommit) {
    const splitTotal = Object.values(input.split).reduce((sum, cents) => sum + cents, 0);
    const freeCashAfterCosts = input.freeCashCents - input.monthlyCostCents;
    if (splitTotal > freeCashAfterCosts) {
      throw new LifeScenarioValidationError(
        "split_exceeds_free_cash",
        `The monthly split (${formatUsd(splitTotal)}) is ${formatUsd(splitTotal - freeCashAfterCosts)} more than the ${formatUsd(freeCashAfterCosts)} available after the event's monthly cost.`,
      );
    }
  }
}

export function analyzeLifeScenario(input: LifeScenarioAnalyzeRequest): LifeScenarioAnalysis {
  validate(input);

  const selected = new Set(input.selectedGoalIds);
  const tripIndex = input.goals.findIndex((goal) => goal.kind === "trip");
  const tripGoal = tripIndex >= 0 ? input.goals[tripIndex]! : null;
  const sourceIndex = input.goals.findIndex((goal) => goal.id === input.oneTimeSourceGoalId);

  const eventMonth = monthNumber(input.startMonth);
  const firstMonth = monthNumber(input.asOf);
  const freeCashAfterCosts = Math.max(0, input.freeCashCents - input.monthlyCostCents);

  const evaluateOption = (option: LifeScenarioOption) => {
    const adjustments = optionAdjustments(option);
    const contributions = input.goals.map((goal) => input.split[goal.id] ?? 0);
    if (tripIndex >= 0) contributions[tripIndex] = (contributions[tripIndex] ?? 0) + adjustments.extraSavedPerMonthCents;
    const oneTimeCostsCents = Math.max(0, input.oneTimeCostCents - adjustments.costReductionCents);
    const runs = input.goals.map((goal, index) => runFunding(
      firstMonth,
      goal.savedCents,
      goal.targetCents,
      goal.monthlyContributionCents,
      {
        due: eventMonth,
        hitCents: index === sourceIndex ? oneTimeCostsCents : 0,
        postMonthlyCents: contributions[index] ?? 0,
      },
    ));
    const tripFundedMonth = tripIndex >= 0 ? runs[tripIndex]!.fundedMonth : null;
    const plannedTripMonth = tripGoal?.plannedDate
      ? monthNumber(tripGoal.plannedDate)
      : tripFundedMonth ?? firstMonth;
    const tripDateMonth = tripFundedMonth !== null ? Math.max(plannedTripMonth, tripFundedMonth + 1) : null;
    return { adjustments, contributions, oneTimeCostsCents, runs, tripFundedMonth, tripDateMonth };
  };

  const optionNames: readonly LifeScenarioOption[] = ["keep", "save_more", "reduce_one_time", "both"];
  const outcomes = new Map(optionNames.map((option) => [option, evaluateOption(option)] as const));
  const baseline = input.goals.map((goal) => runFunding(firstMonth, goal.savedCents, goal.targetCents, goal.monthlyContributionCents));
  const eventOnly = outcomes.get("keep")!;
  const selectedOutcome = outcomes.get(input.selectedOption)!;

  const options = tripGoal
    ? optionNames.map((option) => {
      const result = outcomes.get(option)!;
      const otherGoalsChanged = input.goals.flatMap((goal, index) => {
        if (index === tripIndex) return [];
        return eventOnly.runs[index]!.fundedMonth !== result.runs[index]!.fundedMonth ? [goal.name] : [];
      });
      const tripDate = result.tripDateMonth !== null ? monthDate(result.tripDateMonth) : null;
      const delayMonths = tripGoal.plannedDate && tripDate ? differenceInMonths(tripGoal.plannedDate, tripDate) : null;
      return {
        option,
        tripFundedDate: result.tripFundedMonth !== null ? monthDate(result.tripFundedMonth) : null,
        tripDate,
        delayMonths,
        delayLabel: delayLabel(delayMonths),
        extraSavedPerMonthCents: result.adjustments.extraSavedPerMonthCents,
        oneTimeCostsCents: result.oneTimeCostsCents,
        otherGoalsChanged,
      };
    })
    : [];

  const goals = input.goals.map((goal, index): LifeScenarioAnalysis["goals"][number] => {
    const isTrip = index === tripIndex;
    const beforeFundedDate = baseline[index]!.fundedMonth !== null ? monthDate(baseline[index]!.fundedMonth!) : null;
    const eventOnlyFundedDate = eventOnly.runs[index]!.fundedMonth !== null ? monthDate(eventOnly.runs[index]!.fundedMonth!) : null;
    const fundedDate = selectedOutcome.runs[index]!.fundedMonth !== null ? monthDate(selectedOutcome.runs[index]!.fundedMonth!) : null;
    const beforeDisplayDate = isTrip ? goal.plannedDate : beforeFundedDate;
    const eventOnlyDisplayDate = isTrip
      ? (eventOnly.tripDateMonth !== null ? monthDate(eventOnly.tripDateMonth) : null)
      : eventOnlyFundedDate;
    const displayDate = isTrip
      ? (selectedOutcome.tripDateMonth !== null ? monthDate(selectedOutcome.tripDateMonth) : null)
      : fundedDate;
    const delayMonths = beforeDisplayDate && displayDate ? differenceInMonths(beforeDisplayDate, displayDate) : null;
    const eventOnlyDelayMonths = beforeDisplayDate && eventOnlyDisplayDate
      ? differenceInMonths(beforeDisplayDate, eventOnlyDisplayDate)
      : null;
    return {
      goalId: goal.id,
      name: goal.name,
      targetCents: goal.targetCents,
      savedCents: goal.savedCents,
      kind: goal.kind,
      included: selected.has(goal.id),
      postEventContributionCents: selectedOutcome.contributions[index] ?? 0,
      beforeFundedDate,
      eventOnlyFundedDate,
      fundedDate,
      beforeDisplayDate,
      eventOnlyDisplayDate,
      displayDate,
      delayMonths,
      delayLabel: delayLabel(delayMonths),
      eventOnlyDelayMonths,
      eventOnlyDelayLabel: delayLabel(eventOnlyDelayMonths),
      series: baseline[index]!.series.map((point, pointIndex) => ({
        month: point.month,
        beforeCents: point.balanceCents,
        afterCents: selectedOutcome.runs[index]!.series[pointIndex]?.balanceCents ?? point.balanceCents,
      })),
    };
  });

  const selectedRows = goals.filter((goal) => goal.included && goal.delayMonths !== null);
  const goalsDelayed = selectedRows.filter((goal) => (goal.delayMonths ?? 0) > 0).length;
  const goalsUnchanged = selectedRows.filter((goal) => goal.delayMonths === 0).length;
  const mostAffected = selectedRows.filter((goal) => (goal.delayMonths ?? 0) > 0)
    .sort((a, b) => (b.delayMonths ?? 0) - (a.delayMonths ?? 0))[0] ?? null;
  const timingConflicts = goals.flatMap((goal) => {
    if (!goal.included || !goal.beforeDisplayDate) return [];
    const monthsFromDue = differenceInMonths(input.startMonth, goal.beforeDisplayDate);
    return Math.abs(monthsFromDue) <= 2 ? [{ goalId: goal.goalId, goalName: goal.name, monthsFromDue }] : [];
  });

  return {
    asOf: input.asOf,
    selectedOption: input.selectedOption,
    goals,
    options,
    analysis: {
      freeCashBeforeCents: input.freeCashCents,
      freeCashAfterCents: freeCashAfterCosts,
      monthlyCostsCents: input.monthlyCostCents,
      oneTimeCostsCents: selectedOutcome.oneTimeCostsCents,
      oneTimeCostsPaidBy: input.goals[sourceIndex]?.name ?? "",
      goalsDelayed,
      goalsUnchanged,
      mostAffectedGoalId: mostAffected?.goalId ?? null,
      mostAffectedGoalName: mostAffected?.name ?? null,
      mostAffectedDelayMonths: mostAffected?.delayMonths ?? null,
      mostAffectedDelayLabel: mostAffected?.delayLabel ?? "No Delays",
      timingConflicts,
    },
  };
}

/** What a goal needs each month to land on its target date, given what it has saved so far. */
export function monthlyNeedForGoal(asOf: string, goal: { targetCents: number; currentCents: number; targetDate: string }): number {
  const months = Math.max(1, monthsBetween(asOf, goal.targetDate));
  return Math.max(0, Math.round((goal.targetCents - goal.currentCents) / months));
}

export type { LifeScenarioGoalInput };
