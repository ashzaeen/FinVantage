import { z } from "zod";
import { Cents, Id, IsoDate, IsoDateTime } from "./common";
import { GoalKind } from "./goal";

export const LifeScenarioEventType = z.enum([
  "new_baby",
  "buy_home",
  "job_change",
  "move_city",
  "wedding",
  "custom",
]);
export type LifeScenarioEventType = z.infer<typeof LifeScenarioEventType>;

export const LIFE_SCENARIO_EVENT_LABEL: Record<LifeScenarioEventType, string> = {
  new_baby: "New Baby",
  buy_home: "Buy a Home",
  job_change: "Job Change",
  move_city: "Move Cities",
  wedding: "Wedding",
  custom: "Your Own",
};

export const LifeScenarioOption = z.enum(["keep", "save_more", "reduce_one_time", "both"]);
export type LifeScenarioOption = z.infer<typeof LifeScenarioOption>;

export const LifeScenarioStatus = z.enum(["saved", "draft_applied", "applied"]);
export type LifeScenarioStatus = z.infer<typeof LifeScenarioStatus>;

/** One goal as the life simulator sees it, whether sourced from the user's real goals or a saved scenario. */
export const LifeScenarioGoalInput = z.object({
  id: Id,
  name: z.string().min(1),
  targetCents: Cents.positive(),
  savedCents: Cents.nonnegative(),
  monthlyContributionCents: Cents.nonnegative(),
  kind: GoalKind,
  /** Trip goals only: the planned date before any event is modeled. Null for every other kind. */
  plannedDate: IsoDate.nullable(),
});
export type LifeScenarioGoalInput = z.infer<typeof LifeScenarioGoalInput>;

/** The user's real goals and free cash, shaped for the life simulator. */
export const LifeSimulatorContext = z.object({
  asOf: IsoDate,
  freeCashCents: Cents,
  goals: z.array(LifeScenarioGoalInput),
});
export type LifeSimulatorContext = z.infer<typeof LifeSimulatorContext>;

/** The event and the response plan being modeled. Shared by the stateless analyze call and saved scenarios. */
export const LifeScenarioInput = z.object({
  eventType: LifeScenarioEventType,
  customEventName: z.string().max(40).default(""),
  startMonth: IsoDate,
  monthlyCostCents: Cents.nonnegative(),
  oneTimeCostCents: Cents.nonnegative(),
  /** Which included goal absorbs the one-time cost. */
  oneTimeSourceGoalId: Id,
  selectedGoalIds: z.array(Id).min(1),
  /** Per-goal monthly contribution once the event starts. Keyed by goal id. */
  split: z.record(z.string(), Cents.nonnegative()),
  selectedOption: LifeScenarioOption,
  /** The split may exceed free cash after costs only when this is explicitly set. */
  allowOverCommit: z.boolean().default(false),
});
export type LifeScenarioInput = z.infer<typeof LifeScenarioInput>;

export const LifeScenarioAnalyzeRequest = LifeScenarioInput.extend({
  goals: z.array(LifeScenarioGoalInput).min(1),
  freeCashCents: Cents.nonnegative(),
  asOf: IsoDate,
});
export type LifeScenarioAnalyzeRequest = z.infer<typeof LifeScenarioAnalyzeRequest>;

export const LifeScenarioGoalResult = z.object({
  goalId: Id,
  name: z.string(),
  targetCents: Cents,
  savedCents: Cents,
  kind: GoalKind,
  included: z.boolean(),
  postEventContributionCents: Cents,
  beforeFundedDate: IsoDate.nullable(),
  eventOnlyFundedDate: IsoDate.nullable(),
  fundedDate: IsoDate.nullable(),
  beforeDisplayDate: IsoDate.nullable(),
  eventOnlyDisplayDate: IsoDate.nullable(),
  displayDate: IsoDate.nullable(),
  delayMonths: z.number().int().nullable(),
  delayLabel: z.string(),
  eventOnlyDelayMonths: z.number().int().nullable(),
  eventOnlyDelayLabel: z.string(),
  /** Monthly balances for the goal-over-time chart. */
  series: z.array(z.object({ month: IsoDate, beforeCents: Cents, afterCents: Cents })),
});
export type LifeScenarioGoalResult = z.infer<typeof LifeScenarioGoalResult>;

export const LifeScenarioOptionResult = z.object({
  option: LifeScenarioOption,
  tripFundedDate: IsoDate.nullable(),
  tripDate: IsoDate.nullable(),
  delayMonths: z.number().int().nullable(),
  delayLabel: z.string(),
  extraSavedPerMonthCents: Cents,
  oneTimeCostsCents: Cents,
  otherGoalsChanged: z.array(z.string()),
});
export type LifeScenarioOptionResult = z.infer<typeof LifeScenarioOptionResult>;

export const LifeScenarioAnalysis = z.object({
  asOf: IsoDate,
  selectedOption: LifeScenarioOption,
  goals: z.array(LifeScenarioGoalResult),
  options: z.array(LifeScenarioOptionResult),
  analysis: z.object({
    freeCashBeforeCents: Cents,
    freeCashAfterCents: Cents,
    monthlyCostsCents: Cents,
    oneTimeCostsCents: Cents,
    oneTimeCostsPaidBy: z.string(),
    goalsDelayed: z.number().int().nonnegative(),
    goalsUnchanged: z.number().int().nonnegative(),
    mostAffectedGoalId: Id.nullable(),
    mostAffectedGoalName: z.string().nullable(),
    mostAffectedDelayMonths: z.number().int().nullable(),
    mostAffectedDelayLabel: z.string(),
    timingConflicts: z.array(z.object({ goalId: Id, goalName: z.string(), monthsFromDue: z.number().int() })),
  }),
});
export type LifeScenarioAnalysis = z.infer<typeof LifeScenarioAnalysis>;

/** On-demand PDF export for an unsaved or saved comparison. The API recalculates from its own goal context. */
export const LifeScenarioPdfResponse = z.object({
  filename: z.string().min(1),
  base64: z.string().min(1),
});
export type LifeScenarioPdfResponse = z.infer<typeof LifeScenarioPdfResponse>;

// --- Persisted scenarios ---

export const LifeScenario = LifeScenarioInput.extend({
  id: Id,
  userId: Id,
  name: z.string().min(1).max(80),
  status: LifeScenarioStatus,
  /** The monthly-cost event, and the one-time-cost event when the scenario has one. Empty until confirmed. */
  appliedLifeEventIds: z.array(Id),
  appliedGoalTargetDates: z.array(z.object({ goalId: Id, previousTargetDate: IsoDate })),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type LifeScenario = z.infer<typeof LifeScenario>;

export const NewLifeScenario = LifeScenarioInput.extend({ name: z.string().min(1).max(80) });
export type NewLifeScenario = z.infer<typeof NewLifeScenario>;

export const LifeScenarioApplyResponse = z.object({
  scenario: LifeScenario,
  preview: LifeScenarioAnalysis,
});
export type LifeScenarioApplyResponse = z.infer<typeof LifeScenarioApplyResponse>;

export const LifeScenarioConfirmResponse = z.object({
  scenario: LifeScenario,
  updatedGoalIds: z.array(Id),
  lifeEventIds: z.array(Id),
});
export type LifeScenarioConfirmResponse = z.infer<typeof LifeScenarioConfirmResponse>;

export const LifeScenarioUndoResponse = z.object({
  scenario: LifeScenario,
  restoredGoalIds: z.array(Id),
});
export type LifeScenarioUndoResponse = z.infer<typeof LifeScenarioUndoResponse>;
