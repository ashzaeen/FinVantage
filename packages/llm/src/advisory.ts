import type { Goal, RecommendationOption, Situation } from "@finvantage/contracts";
import type { LlmClient } from "./client";

export interface AdvisoryInput {
  situation: Situation;
  goals: Goal[];
  latestRunId: string | null;
}

/**
 * STUB(advisory): returns canned options. The real agent uses Gemini function calling with the
 * math core and simulator as tools. Non-negotiable goals get spending-cut options, flexible
 * goals get timeline options. Every option's numbers come from a simulation run.
 */
export async function generateOptions(
  _llm: LlmClient,
  input: AdvisoryInput,
): Promise<RecommendationOption[]> {
  const goal = input.goals[0] ?? null;
  const placeholder = {
    goalId: goal?.id ?? null,
    probabilityDelta: null,
    figures: [{ label: "Status", value: "Placeholder until the Advisory Agent is built" }],
    simulationRunId: input.latestRunId,
  };
  return [
    { ...placeholder, rank: 1, title: "Cut a spending category", tradeOff: "Less room each month." },
    { ...placeholder, rank: 2, title: "Push the goal back", tradeOff: "You reach it later." },
  ];
}
