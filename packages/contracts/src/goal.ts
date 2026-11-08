import { z } from "zod";
import { Cents, Id, IsoDate } from "./common";

export const Flexibility = z.enum(["flexible", "non_negotiable"]);
export type Flexibility = z.infer<typeof Flexibility>;

export const GoalStatus = z.enum(["not_started", "in_progress", "achieved", "done"]);
export type GoalStatus = z.infer<typeof GoalStatus>;

/** "trip" goals use their targetDate as a planned departure date in the life simulator: a one-time
 * cost can delay funding, but the trip itself never moves earlier than one month after funding. */
export const GoalKind = z.enum(["standard", "trip"]);
export type GoalKind = z.infer<typeof GoalKind>;

export const Goal = z.object({
  id: Id,
  userId: Id,
  name: z.string(),
  targetCents: Cents.positive(),
  currentCents: Cents.nonnegative(),
  targetDate: IsoDate,
  /** 1 is funded first. Goals compete for the same dollars in this order. */
  priorityRank: z.number().int().positive(),
  flexibility: Flexibility,
  linkedAccountId: Id.nullable(),
  /** Board status is separate from the saved balance so users can track goal lifecycle. */
  status: GoalStatus.optional(),
  kind: GoalKind.optional(),
});
export type Goal = z.infer<typeof Goal>;

export const NewGoal = Goal.omit({ id: true, userId: true });
export type NewGoal = z.infer<typeof NewGoal>;
