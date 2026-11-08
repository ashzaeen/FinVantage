import { z } from "zod";
import { Account } from "./account";
import { Cents, Id, IsoDate, IsoDateTime, Probability } from "./common";
import { Goal } from "./goal";
import { LifeEvent } from "./life-event";

/** Derived from the ledger. The math core and simulator read this, never the raw stores. */
export const FinancialSnapshot = z.object({
  asOf: IsoDate,
  accounts: z.array(Account),
  monthlyIncomeCents: Cents,
  monthlyFixedCostsCents: Cents,
  monthlyDebtPaymentsCents: Cents,
  monthlySpendingCents: Cents,
  monthlySavingsCents: Cents,
  nextPaydayOn: IsoDate,
  bufferTargetCents: Cents,
});
export type FinancialSnapshot = z.infer<typeof FinancialSnapshot>;

/** The three PRD sliders. */
export const WhatIf = z.object({
  monthlySavingsDeltaCents: Cents.default(0),
  purchaseAmountCents: Cents.nonnegative().default(0),
  eventShifts: z.array(z.object({ lifeEventId: Id, shiftMonths: z.number().int() })).default([]),
});
export type WhatIf = z.infer<typeof WhatIf>;

export const SimulationRequest = z.object({
  whatIf: WhatIf.optional(),
  /** Same seed and inputs must give the same result. */
  seed: z.number().int().optional(),
  paths: z.number().int().positive().max(50_000).optional(),
  /** Slider drags send false so previews do not flood the run history. */
  persist: z.boolean().default(true),
});
export type SimulationRequest = z.input<typeof SimulationRequest>;

export const SimulationInputs = z.object({
  snapshot: FinancialSnapshot,
  goals: z.array(Goal),
  lifeEvents: z.array(LifeEvent),
  whatIf: WhatIf.nullable(),
});
export type SimulationInputs = z.infer<typeof SimulationInputs>;

export const FanPoint = z.object({
  date: IsoDate,
  p10Cents: Cents,
  p25Cents: Cents,
  p50Cents: Cents,
  p75Cents: Cents,
  p90Cents: Cents,
});
export type FanPoint = z.infer<typeof FanPoint>;

export const GoalOutcome = z.object({
  goalId: Id,
  /** Always show as a range, with the disclaimer nearby. */
  probabilityLow: Probability,
  probabilityHigh: Probability,
  medianCompletionDate: IsoDate.nullable(),
  fan: z.array(FanPoint),
});
export type GoalOutcome = z.infer<typeof GoalOutcome>;

export const SimulationResult = z.object({
  paths: z.number().int(),
  seed: z.number().int(),
  goalOutcomes: z.array(GoalOutcome),
});
export type SimulationResult = z.infer<typeof SimulationResult>;

export const SimulationRun = SimulationResult.extend({
  id: Id,
  userId: Id,
  createdAt: IsoDateTime,
  inputs: SimulationInputs,
  /** Priorities are saved per run so later attribution can separate reprioritizing from spending. */
  prioritySetup: z.array(z.object({ goalId: Id, priorityRank: z.number().int() })),
  previousRunId: Id.nullable(),
  /** False for what-if previews, which are returned but not stored. */
  persisted: z.boolean(),
});
export type SimulationRun = z.infer<typeof SimulationRun>;

export const SimulationRunSummary = SimulationRun.pick({
  id: true,
  createdAt: true,
  previousRunId: true,
  seed: true,
  paths: true,
});
export type SimulationRunSummary = z.infer<typeof SimulationRunSummary>;

export const GoalImpact = z.object({
  goalId: Id,
  goalName: z.string(),
  probabilityLowDelta: z.number(),
  probabilityHighDelta: z.number(),
  /** The range after the change, so cards can say "from 93-94% to 76-77%". */
  probabilityLowAfter: z.number(),
  probabilityHighAfter: z.number(),
  /** Positive means later. Null when the goal has no median completion date. */
  delayMonths: z.number().nullable(),
});
export type GoalImpact = z.infer<typeof GoalImpact>;

export const SimulationDiff = z.object({
  fromRunId: Id,
  toRunId: Id,
  goals: z.array(GoalImpact),
});
export type SimulationDiff = z.infer<typeof SimulationDiff>;
