import type { CopilotAction, CopilotContext, CopilotEvaluateResponse } from "@finvantage/contracts";

/** Content script to service worker. Only the service worker talks to the API. */
export type ExtensionMessage =
  | { type: "evaluate"; context: CopilotContext; site: string; page: string }
  | { type: "action"; eventId: string; action: CopilotAction; site: string; page: string };

export type EvaluateReply =
  | { kind: "result"; result: CopilotEvaluateResponse; webUrl: string }
  /** Disabled, snoozed, dismissed this session, or the request failed. Show nothing. */
  | { kind: "silent" };
