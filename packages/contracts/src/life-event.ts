import { z } from "zod";
import { Cents, Id, IsoDate } from "./common";

export const LifeEventType = z.enum(["child", "house_purchase", "job_change", "move", "wedding", "custom"]);
export type LifeEventType = z.infer<typeof LifeEventType>;

export const LIFE_EVENT_LABEL: Record<LifeEventType, string> = {
  child: "Having a child",
  house_purchase: "Buying a house",
  job_change: "Changing jobs",
  move: "Moving",
  wedding: "Getting married",
  custom: "A life change",
};

/** The form and the free-text parser both produce this, so the simulator never cares which ran. */
export const LifeEventDraft = z.object({
  type: LifeEventType,
  date: IsoDate,
  recurrence: z.enum(["one_time", "recurring"]),
  /** Negative costs money, positive adds money. Monthly when recurring. */
  dollarImpactCents: Cents,
  /** Null means open-ended or one-time. */
  durationMonths: z.number().int().positive().nullable(),
  linkedGoalId: Id.nullable(),
  source: z.enum(["form", "parsed"]),
});
export type LifeEventDraft = z.infer<typeof LifeEventDraft>;

export const LifeEvent = LifeEventDraft.extend({ id: Id, userId: Id });
export type LifeEvent = z.infer<typeof LifeEvent>;

export const ParseLifeEventRequest = z.object({ text: z.string().min(1) });

/** Parsing never saves. The user confirms a draft, then the client POSTs it. */
export const ParseLifeEventResponse = z.discriminatedUnion("matched", [
  z.object({ matched: z.literal(true), draft: LifeEventDraft }),
  z.object({
    matched: z.literal(false),
    message: z.string(),
    supportedTypes: z.array(LifeEventType),
  }),
]);
export type ParseLifeEventResponse = z.infer<typeof ParseLifeEventResponse>;
