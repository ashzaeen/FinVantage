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

/** Email + password sign-in. The API lowercases emails. */
export const LogInRequest = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});
export type LogInRequest = z.infer<typeof LogInRequest>;

export const SignUpRequest = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

/** `token` is a signed JWT. Send it as `Authorization: Bearer`. */
export const AuthResponse = z.object({ token: z.string().min(1), user: User });
export type AuthResponse = z.infer<typeof AuthResponse>;
