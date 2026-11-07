import { z } from "zod";
import { Id } from "./common";
import { CopilotEvent } from "./copilot";

/** Messages pushed to the dashboard, over SSE or Spacetime. Same shape either way. */
export const LiveEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("copilot.event"), event: CopilotEvent }),
  z.object({ type: z.literal("simulation.updated"), runId: Id }),
  z.object({ type: z.literal("transaction.added"), transactionId: Id }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;
