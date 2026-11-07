import type { QuarterlyReport } from "@finvantage/contracts";
import type { LlmClient } from "./client";

export type ReportBody = Pick<
  QuarterlyReport,
  "wentWell" | "didNotGoWell" | "why" | "lookAhead" | "nextSteps"
>;

/**
 * STUB(advisory): P2. Source data is stored simulation runs, Copilot events, and recommendations.
 * Must cite a number from each of two consecutive quarters and name the largest change's cause.
 */
export async function generateQuarterlyReport(_llm: LlmClient, quarter: string): Promise<ReportBody> {
  return {
    wentWell: [`Placeholder for ${quarter}.`],
    didNotGoWell: [],
    why: "Placeholder until the Quarterly Report Agent is built.",
    lookAhead: "Placeholder.",
    nextSteps: ["Placeholder."],
  };
}
