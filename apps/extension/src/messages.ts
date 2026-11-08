import type { CopilotAction, CopilotContext, CopilotEvaluateResponse } from "@finvantage/contracts";

/** Content script to service worker. Only the service worker talks to the API. */
export type ExtensionMessage =
  | { type: "evaluate"; context: CopilotContext; site: string; page: string }
  | { type: "action"; eventId: string; action: CopilotAction; site: string; page: string }
  /** Popup to service worker. The password is used once to log in and never stored. */
  | { type: "signIn"; email: string; password: string }
  | { type: "signOut" }
  | { type: "account" };

/** Who the Copilot is answering for. Null name: signed out, so the shared demo profile. */
export type AccountReply = { name: string | null };

export type SignInReply = { ok: true; name: string } | { ok: false; message: string };

export type EvaluateReply =
  | { kind: "result"; result: CopilotEvaluateResponse; webUrl: string }
  /** Disabled, snoozed, dismissed this session, or the request failed. Show nothing. */
  | { kind: "silent" };
