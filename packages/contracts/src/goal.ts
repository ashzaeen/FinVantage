import { z } from "zod";
import { Cents, Id, IsoDate } from "./common";

export const Flexibility = z.enum(["flexible", "non_negotiable"]);
export type Flexibility = z.infer<typeof Flexibility>;

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
});
export type Goal = z.infer<typeof Goal>;

export const NewGoal = Goal.omit({ id: true, userId: true });
export type NewGoal = z.infer<typeof NewGoal>;
