import {
  LifeEventDraft,
  LifeEventType,
  type ParseLifeEventResponse,
} from "@finvantage/contracts";
import type { LlmClient } from "./client";

const NO_MATCH: ParseLifeEventResponse = {
  matched: false,
  message: "I could not match that.",
  supportedTypes: LifeEventType.options,
};

/**
 * STUB(life-events): Path 2 of hybrid entry. Must return a draft for confirmation and never
 * save. Unknown events return `NO_MATCH`. With the mock provider this always returns no match.
 */
export async function parseLifeEvent(
  llm: LlmClient,
  text: string,
  today: string,
): Promise<ParseLifeEventResponse> {
  try {
    const raw = await llm.generate({
      tier: "flash",
      system:
        `Today is ${today}. Convert the user's sentence into a life event. Supported types: ` +
        `${LifeEventType.options.join(", ")}. Return JSON, or {"matched":false} if none fit.`,
      prompt: text,
    });
    const draft = LifeEventDraft.safeParse({ ...JSON.parse(raw), source: "parsed" });
    return draft.success ? { matched: true, draft: draft.data } : NO_MATCH;
  } catch {
    return NO_MATCH;
  }
}
