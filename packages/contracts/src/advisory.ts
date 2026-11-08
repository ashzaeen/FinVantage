import { z } from "zod";
import { Cents, Id, IsoDate, IsoDateTime, Probability } from "./common";

export const Situation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("copilot_event"), eventId: Id }),
  z.object({ kind: z.literal("simulation_change"), runId: Id }),
  z.object({ kind: z.literal("user_question"), question: z.string().min(1) }),
]);
export type Situation = z.infer<typeof Situation>;

export const RecommendationOption = z.object({
  rank: z.number().int().positive(),
  title: z.string(),
  tradeOff: z.string(),
  goalId: Id.nullable(),
  /** Quantified effect on the goal's probability, from the simulator. */
  probabilityDelta: z.number().nullable(),
  /** The numbers this option rests on. */
  figures: z.array(z.object({ label: z.string(), value: z.string() })),
  simulationRunId: Id.nullable(),
});
export type RecommendationOption = z.infer<typeof RecommendationOption>;

export const Recommendation = z.object({
  id: Id,
  userId: Id,
  situation: Situation,
  /** Two to three, never one bossy answer. */
  options: z.array(RecommendationOption).min(2).max(3),
  createdAt: IsoDateTime,
});
export type Recommendation = z.infer<typeof Recommendation>;

export const AdvisorChatRequestBody = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(12),
});
export type AdvisorChatRequest = z.infer<typeof AdvisorChatRequestBody>;
export const AdvisorChatResponse = z.object({ answer: z.string().min(1), source: z.enum(["gemini", "fallback"]) });

export const Quarter = z.string().regex(/^\d{4}-Q[1-4]$/, "Expected a quarter such as 2026-Q3");
export type Quarter = z.infer<typeof Quarter>;

export const ReportEvidence = z.object({
  quarter: Quarter,
  label: z.string(),
  value: z.string(),
  sourceType: z.enum(["simulation_run", "copilot_event", "recommendation"]),
  sourceId: Id,
  probabilityLow: z.number().min(0).max(1).nullable(),
  probabilityHigh: z.number().min(0).max(1).nullable(),
});
export type ReportEvidence = z.infer<typeof ReportEvidence>;

export const LargestQuarterlyChange = z.object({
  label: z.string(),
  previousValue: z.string(),
  currentValue: z.string(),
  change: z.string(),
  cause: z.string(),
});
export type LargestQuarterlyChange = z.infer<typeof LargestQuarterlyChange>;

export const ReportSourceIds = z.object({
  simulationRunIds: z.array(Id),
  copilotEventIds: z.array(Id),
  recommendationIds: z.array(Id),
});

export const ReportPdf = z.object({
  status: z.enum(["pending", "ready", "failed"]),
  fileName: z.string().nullable(),
  generatedAt: IsoDateTime.nullable(),
});

export const ReportEmail = z.object({
  status: z.enum(["not_requested", "sent", "failed"]),
  sentAt: IsoDateTime.nullable(),
  messageId: z.string().nullable(),
  error: z.string().nullable(),
});

export const MonthlyContribution = z.object({
  month: z.string(),
  monthKey: z.string(),
  incomeCents: Cents,
  spendingCents: Cents,
  savingsCents: Cents,
  categorySpending: z.array(z.object({
    category: z.string(),
    cents: Cents,
  })).default([]),
});
export type MonthlyContribution = z.infer<typeof MonthlyContribution>;

export const ReportVisuals = z.object({
  summary: z.object({
    netWorthCents: Cents,
    monthlyIncomeCents: Cents,
    monthlySavingsCents: Cents,
    monthlySpendingCents: Cents,
  }),
  accountAllocation: z.array(
    z.object({ label: z.string(), balanceCents: Cents.nonnegative() }),
  ),
  spendingTrend: z.array(
    z.object({ quarter: Quarter, monthlySpendingCents: Cents.nonnegative() }),
  ),
  monthlyBreakdown: z.array(MonthlyContribution).default([]),
  goalComparisons: z.array(
    z.object({
      goalId: Id,
      goalName: z.string(),
      previousLow: Probability,
      previousHigh: Probability,
      currentLow: Probability,
      currentHigh: Probability,
    }),
  ),
  goalPathways: z.array(
    z.object({
      goalId: Id,
      goalName: z.string(),
      targetCents: Cents.nonnegative(),
      targetDate: IsoDate,
      probabilityLow: Probability,
      probabilityHigh: Probability,
      medianCompletionDate: IsoDate.nullable(),
      status: z.enum(["on_track", "watch", "needs_attention"]),
      points: z.array(
        z.object({
          date: IsoDate,
          p10Cents: Cents,
          p50Cents: Cents,
          p90Cents: Cents,
        }),
      ),
    }),
  ),
  suggestions: z.array(
    z.object({
      category: z.enum(["maintain", "review", "explore"]),
      goalId: Id,
      title: z.string(),
      detail: z.string(),
    }),
  ).default([]),
});
export type ReportVisuals = z.infer<typeof ReportVisuals>;

export const QuarterlyReport = z.object({
  id: Id,
  userId: Id,
  quarter: Quarter,
  previousQuarter: Quarter.nullable(),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  wentWell: z.array(z.string()),
  didNotGoWell: z.array(z.string()),
  why: z.string(),
  lookAhead: z.string(),
  nextSteps: z.array(z.string()).min(1).max(2),
  evidence: z.array(ReportEvidence).min(1),
  largestChange: LargestQuarterlyChange.nullable(),
  sourceIds: ReportSourceIds,
  narrativeSource: z.enum(["llm", "template"]),
  visuals: ReportVisuals,
  pdf: ReportPdf,
  email: ReportEmail,
  previousReportId: Id.nullable(),
  createdAt: IsoDateTime,
});
export type QuarterlyReport = z.infer<typeof QuarterlyReport>;

export const EmailScheduleFrequency = z.enum(["hourly", "daily", "weekly", "monthly", "quarterly"]);
export type EmailScheduleFrequency = z.infer<typeof EmailScheduleFrequency>;

export const EmailSchedule = z.object({
  id: Id,
  userId: Id,
  enabled: z.boolean().default(false),
  frequency: EmailScheduleFrequency.default("monthly"),
  recipientEmail: z.string().email(),
  lastSentAt: IsoDateTime.nullable().default(null),
  lastStatus: z.enum(["success", "failed", "pending", "idle"]).default("idle"),
  lastError: z.string().nullable().default(null),
  lastReportId: Id.nullable().default(null),
  nextScheduledAt: IsoDateTime.nullable().default(null),
  leaseExpiresAt: IsoDateTime.nullable().default(null),
  activeAttemptId: Id.nullable().default(null),
  updatedAt: IsoDateTime,
});
export type EmailSchedule = z.infer<typeof EmailSchedule>;

export const UpdateEmailScheduleInput = z.object({
  enabled: z.boolean(),
  frequency: EmailScheduleFrequency,
  recipientEmail: z.string().email(),
});
export type UpdateEmailScheduleInput = z.infer<typeof UpdateEmailScheduleInput>;

export const EmailScheduleLogEntry = z.object({
  id: Id,
  userId: Id,
  sentAt: IsoDateTime,
  recipient: z.string(),
  reportId: Id.nullable(),
  quarter: Quarter.nullable(),
  status: z.enum(["success", "failed"]),
  messageId: z.string().nullable(),
  error: z.string().nullable(),
  attemptId: Id.nullable().default(null),
});
export type EmailScheduleLogEntry = z.infer<typeof EmailScheduleLogEntry>;
