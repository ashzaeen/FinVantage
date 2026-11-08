import { z } from "zod";
import { Cents, Id } from "./common";

export const ExtensionSettings = z.object({
  enabled: z.boolean(),
  snoozedSites: z.array(z.string()),
});
export type ExtensionSettings = z.infer<typeof ExtensionSettings>;

export const User = z.object({
  id: Id,
  displayName: z.string(),
  email: z.string().email().nullable().default(null),
  preferences: z.object({
    /** The "checking buffer target" the Copilot compares against. */
    bufferTargetCents: Cents,
  }),
  extensionSettings: ExtensionSettings,
});
export type User = z.infer<typeof User>;
