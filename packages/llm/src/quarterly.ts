import { z } from "zod";
import type {
  LargestQuarterlyChange,
  Quarter,
  QuarterlyReport,
  ReportEvidence,
  ReportVisuals,
} from "@finvantage/contracts";
import { formatPercent, formatUsd } from "@finvantage/contracts";
import type { LlmClient } from "./client";
import { validateNumbers } from "./guardrails";

const ReportBodySchema = z.object({
  wentWell: z.array(z.string()).min(1).max(4),
  didNotGoWell: z.array(z.string()).min(1).max(4),
  why: z.string(),
  lookAhead: z.string(),
  nextSteps: z.array(z.string()).min(1).max(2),
});

export type ReportBody = z.infer<typeof ReportBodySchema>;

export interface QuarterlyReportInput {
  quarter: Quarter;
  previousQuarter: Quarter | null;
  evidence: ReportEvidence[];
  largestChange: LargestQuarterlyChange | null;
  visuals: ReportVisuals;
  activity: {
    currentCopilotEvents: number;
    previousCopilotEvents: number;
    currentRecommendations: number;
    previousRecommendations: number;
  };
}

export interface GeneratedQuarterlyReport {
  body: ReportBody;
  source: QuarterlyReport["narrativeSource"];
}

function templateReport(input: QuarterlyReportInput): ReportBody {
  const current = input.evidence.find((item) => item.quarter === input.quarter) ?? input.evidence[0];
  const onTrack = input.visuals.goalPathways.filter((goal) => goal.status === "on_track");
  const attention = input.visuals.goalPathways.filter((goal) => goal.status !== "on_track");
  const activitySummary = `${input.activity.currentCopilotEvents} Copilot events and ${input.activity.currentRecommendations} advisor recommendations were stored this quarter.`;
  const strongestGoals = onTrack.slice(0, 3).map((goal) =>
    `${goal.goalName} is on track with an estimated ${formatPercent(goal.probabilityLow)} to ${formatPercent(goal.probabilityHigh)} probability range.`,
  );
  const goalsToReview = attention.slice(0, 3).map((goal) =>
    `${goal.goalName} is marked ${goal.status === "watch" ? "for review" : "as needing attention"}, with an estimated ${formatPercent(goal.probabilityLow)} to ${formatPercent(goal.probabilityHigh)} range.`,
  );
  if (!input.previousQuarter || !input.largestChange) {
    return {
      wentWell: [...strongestGoals, `${current.label} was ${current.value} for ${input.quarter}.`].slice(0, 4),
      didNotGoWell: [...goalsToReview, "A prior-quarter simulation was not available for comparison."].slice(0, 4),
      why: `This report establishes a single-quarter baseline from the stored simulation run. ${activitySummary}`,
      lookAhead: `Track the same goals, monthly spending, and account position through the next quarter so the agent can establish direction. Current net worth is ${formatUsd(input.visuals.summary.netWorthCents)}.`,
      nextSteps: [
        "Review the goals marked for review or needing attention and test one savings or timeline scenario.",
        "Save the next meaningful simulation update so the following report can make a quarter-over-quarter comparison.",
      ],
    };
  }
  const previous = input.evidence.find((item) => item.quarter === input.previousQuarter)!;
  const improved = input.largestChange.change.includes("higher");
  const comparison = `${input.largestChange.label}. Previous range: ${input.largestChange.previousValue}. Current range: ${input.largestChange.currentValue}.`;
  return {
    wentWell: [
      ...(improved ? [`${current.label} was ${current.value}, compared with ${previous.value} previously.`] : []),
      ...strongestGoals,
      activitySummary,
    ].slice(0, 4),
    didNotGoWell: [
      ...(!improved ? [comparison] : []),
      ...goalsToReview,
      ...(improved && goalsToReview.length === 0 ? ["No larger evidence-backed setback was identified in the stored goal ranges."] : []),
    ].slice(0, 4),
    why: `${input.largestChange.change}. ${input.largestChange.cause} The comparison uses stored simulations from ${input.previousQuarter} and ${input.quarter}.`,
    lookAhead: `Monitor the goal ranges, ${formatUsd(input.visuals.summary.monthlySpendingCents)} monthly spending assumption, and new Copilot activity next quarter. Current net worth is ${formatUsd(input.visuals.summary.netWorthCents)}.`,
    nextSteps: [
      "Review the largest change and confirm whether its saved assumptions still match the current plan.",
      attention[0]
        ? `Test one alternative savings amount or target date for ${attention[0].goalName}.`
        : "Continue the current plan and save a new simulation when income, spending, or a goal changes.",
    ],
  };
}

export function quarterlySystemPrompt(hasPreviousQuarter: boolean) {
  const comparisonInstruction = hasPreviousQuarter
    ? "Compare the two supplied quarters explicitly and name the supplied cause of the largest change verbatim."
    : "Only one quarter is available. Write a single-quarter baseline, explicitly say that no prior-quarter comparison is available, and never imply a change over time.";
  return [
    "You are FinVantage's quarterly financial-report writer.",
    "The application has already computed every figure. Use only supplied evidence and never calculate, invent, round, or alter a number.",
    comparisonInstruction,
    "Explain what went well, what needs attention, why, and what to watch next in supportive plain language.",
    "Be substantive: cover the financial snapshot, every supplied goal that materially needs attention, stored Copilot and recommendation activity, and the quarter-over-quarter direction. Use up to four concise findings in each findings array.",
    "Distinguish recorded transaction activity from saved planning assumptions. If monthly transaction data is absent, say so rather than treating an assumption as observed spending.",
    "Suggest rather than command. Do not promise outcomes, move money, recommend a specific security, or present probability ranges as guarantees.",
    "Return only valid JSON matching the supplied schema, with one or two concrete next steps.",
  ].join(" ");
}

/**
 * Whether the text states a stored sentence, such as the cause of a change. The model works it
 * into its own sentence ("...because the saved monthly savings scenario changed, so..."), so
 * capitals, spacing and the closing full stop don't count. The words must still all be there.
 */
function mentions(text: string, sentence: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  return normalize(text).includes(normalize(sentence).replace(/[.!]+$/, ""));
}

function allText(body: ReportBody) {
  return [
    ...body.wentWell,
    ...body.didNotGoWell,
    body.why,
    body.lookAhead,
    ...body.nextSteps,
  ].join(" ");
}

/**
 * Gemini writes the prose; deterministic evidence and validation own every figure.
 */
export async function generateQuarterlyReport(
  llm: LlmClient,
  input: QuarterlyReportInput,
): Promise<GeneratedQuarterlyReport> {
  const fallback = templateReport(input);
  try {
    const raw = await llm.generate({
      tier: "flash",
      system: quarterlySystemPrompt(Boolean(input.previousQuarter && input.largestChange)),
      prompt: JSON.stringify({
        reportMode: input.previousQuarter ? "quarter_over_quarter" : "single_quarter_baseline",
        quarter: input.quarter,
        previousQuarter: input.previousQuarter,
        evidence: input.evidence,
        largestChange: input.largestChange,
        activity: input.activity,
        financialSnapshot: {
          netWorth: formatUsd(input.visuals.summary.netWorthCents),
          monthlyIncome: formatUsd(input.visuals.summary.monthlyIncomeCents),
          monthlySpendingAssumption: formatUsd(input.visuals.summary.monthlySpendingCents),
          monthlySavingsAssumption: formatUsd(input.visuals.summary.monthlySavingsCents),
          hasRecordedMonthlyTransactions: input.visuals.monthlyBreakdown.some(
            (month) => month.incomeCents !== 0 || month.spendingCents !== 0,
          ),
        },
        goals: input.visuals.goalPathways.map((goal) => ({
          name: goal.goalName,
          status: goal.status,
          target: formatUsd(goal.targetCents),
          targetDate: goal.targetDate,
          probabilityRange: `${formatPercent(goal.probabilityLow)} to ${formatPercent(goal.probabilityHigh)}`,
          medianCompletionDate: goal.medianCompletionDate,
        })),
      }),
      jsonSchema: {
        type: "object",
        properties: {
          wentWell: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
          didNotGoWell: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
          why: { type: "string" },
          lookAhead: { type: "string" },
          nextSteps: { type: "array", minItems: 1, maxItems: 2, items: { type: "string" } },
        },
        required: ["wentWell", "didNotGoWell", "why", "lookAhead", "nextSteps"],
        additionalProperties: false,
      },
    });
    const body = ReportBodySchema.parse(JSON.parse(raw));
    const allowed = [
      input.quarter,
      ...(input.previousQuarter ? [input.previousQuarter] : []),
      ...input.evidence.map((item) => item.value),
      ...(input.largestChange
        ? [
            input.largestChange.previousValue,
            input.largestChange.currentValue,
            input.largestChange.change,
          ]
        : []),
      String(input.activity.currentCopilotEvents),
      String(input.activity.previousCopilotEvents),
      String(input.activity.currentRecommendations),
      String(input.activity.previousRecommendations),
      formatUsd(input.visuals.summary.netWorthCents),
      formatUsd(input.visuals.summary.monthlyIncomeCents),
      formatUsd(input.visuals.summary.monthlySpendingCents),
      formatUsd(input.visuals.summary.monthlySavingsCents),
      ...input.visuals.goalPathways.flatMap((goal) => [
        formatUsd(goal.targetCents),
        formatPercent(goal.probabilityLow),
        formatPercent(goal.probabilityHigh),
        goal.targetDate,
        ...(goal.medianCompletionDate ? [goal.medianCompletionDate] : []),
      ]),
    ];
    const text = allText(body);
    if (!validateNumbers(text, allowed).ok) return { body: fallback, source: "template" };
    const currentFigure = input.evidence.find((item) => item.quarter === input.quarter);
    if (!currentFigure || !text.includes(currentFigure.value)) {
      return { body: fallback, source: "template" };
    }
    if (input.previousQuarter && input.largestChange) {
      const previousFigure = input.evidence.find((item) => item.quarter === input.previousQuarter);
      if (!previousFigure || !text.includes(previousFigure.value)) {
        return { body: fallback, source: "template" };
      }
      if (!mentions(text, input.largestChange.cause)) {
        return { body: fallback, source: "template" };
      }
    }
    return { body, source: "llm" };
  } catch {
    return { body: fallback, source: "template" };
  }
}
