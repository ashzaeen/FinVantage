import { z } from "zod";
import { Id, IsoDateTime } from "./common";

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

export const QuarterlyReport = z.object({
  id: Id,
  userId: Id,
  quarter: z.string(),
  wentWell: z.array(z.string()),
  didNotGoWell: z.array(z.string()),
  why: z.string(),
  lookAhead: z.string(),
  nextSteps: z.array(z.string()).min(1).max(2),
  previousReportId: Id.nullable(),
  createdAt: IsoDateTime,
});
export type QuarterlyReport = z.infer<typeof QuarterlyReport>;
