import type { AdvisorMessage, ChangeRequest } from "@finvantage/contracts";

/**
 * What a short spoken reply means while a change is waiting for an answer. Only a whole utterance
 * counts: "yes" saves, "yes but make it $50" is sent to the Advisor like any other message.
 */
export type SpokenIntent = "yes" | "no" | "undo";

const YES = /^(?:yes|yeah|yep|yup|sure|ok|okay|correct|confirm|confirmed|do it|go ahead|go for it|save it|save that|that's right|that is right|sounds good|please do)(?: (?:please|thanks|thank you|do it|save it|confirm))?$/;
const NO = /^(?:no|nope|nah|cancel|cancel that|never mind|nevermind|don't|do not|stop|forget it|scratch that|don't save it|do not save it)(?: (?:thanks|thank you|please))?$/;
const UNDO = /^(?:undo|undo that|undo it|take that back|take it back|revert that|revert it|reverse that|reverse it)$/;

export function spokenIntent(text: string): SpokenIntent | null {
  const said = text.toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
  if (!said) return null;
  if (UNDO.test(said)) return "undo";
  if (YES.test(said)) return "yes";
  if (NO.test(said)) return "no";
  return null;
}

/** A change waiting on the user: its id is the draft card's, so the card and a spoken yes share one state. */
export interface PendingDraft {
  id: string;
  title: string;
  request: ChangeRequest;
  /** Removes something or cannot be taken back, so a tap is needed. */
  destructive: boolean;
  /** What the confirm button says, for the app to point at. */
  confirmLabel: string;
}

/** The drafts on an Advisor message, in order. A goal draft counts as creating that goal. */
export function draftsOf(message: Pick<AdvisorMessage, "id" | "attachments">): PendingDraft[] {
  return message.attachments.flatMap((a, i): PendingDraft[] => {
    const id = `${message.id}:${i}`;
    if (a.kind === "change_draft") return [{ id, title: a.title, request: a.request, destructive: a.destructive, confirmLabel: a.confirmLabel ?? "Confirm Removal" }];
    if (a.kind === "goal_draft") return [{ id, title: "New Goal", request: { action: "create_goal", body: a.goal }, destructive: false, confirmLabel: "Confirm" }];
    return [];
  });
}
