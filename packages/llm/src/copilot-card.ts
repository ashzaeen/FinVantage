import {
  formatPercent,
  formatUsd,
  type CopilotCard,
  type CopilotContext,
  type CopilotMetrics,
} from "@finvantage/contracts";
import type { LlmClient } from "./client";
import { validateCard } from "./guardrails";

function keyFigures(metrics: CopilotMetrics): CopilotCard["keyFigures"] {
  const figures: CopilotCard["keyFigures"] = [];
  const { fixedCostRatioBefore: before, fixedCostRatioAfter: after } = metrics;
  if (before !== null && after !== null) {
    figures.push({
      label: "Fixed costs of income",
      value: `${formatPercent(before)} to ${formatPercent(after)}`,
    });
  }
  if (metrics.debtToIncomeBefore !== null && metrics.debtToIncomeAfter !== null) {
    figures.push({
      label: "Debt-to-income",
      value: `${formatPercent(metrics.debtToIncomeBefore)} to ${formatPercent(metrics.debtToIncomeAfter)}`,
    });
  }
  if (metrics.liquidBufferAfterCents !== null) {
    figures.push({ label: "Checking after", value: formatUsd(metrics.liquidBufferAfterCents) });
    figures.push({ label: "Buffer target", value: formatUsd(metrics.bufferTargetCents) });
  }
  if (metrics.safeRentThresholdCents !== null) {
    figures.push({ label: "Safe rent", value: formatUsd(metrics.safeRentThresholdCents) });
  }
  if (metrics.daysUntilPayday !== null) {
    figures.push({ label: "Days to payday", value: String(metrics.daysUntilPayday) });
  }
  const worst = metrics.goalImpacts.find((g) => (g.delayMonths ?? 0) > 0);
  if (worst) figures.push({ label: `${worst.goalName} delay`, value: `${worst.delayMonths} months` });
  return figures;
}

/** Deterministic card built only from the math core. The demo never shows an empty state. */
export function templateCard(context: CopilotContext, metrics: CopilotMetrics): CopilotCard {
  const figures = keyFigures(metrics);
  const price = formatUsd(context.priceCents);
  const base = { keyFigures: figures, source: "template" as const };

  if (context.pageType === "rental") {
    return {
      ...base,
      impact: `At ${price} a month, fixed costs move to ${formatPercent(metrics.fixedCostRatioAfter ?? 0)} of income.`,
      tradeOff: "Higher rent means less going to your goals each month.",
      smartMove: `Look at or under ${formatUsd(metrics.safeRentThresholdCents ?? 0)} a month.`,
    };
  }
  if (context.pageType === "checkout") {
    return {
      ...base,
      impact: `Paying ${price} leaves ${formatUsd(metrics.liquidBufferAfterCents ?? 0)} in checking.`,
      tradeOff: `Your buffer target is ${formatUsd(metrics.bufferTargetCents)}, with ${metrics.daysUntilPayday ?? 0} days to payday.`,
      smartMove: "Consider splitting the payment or waiting until after payday.",
    };
  }
  return {
    ...base,
    impact: `Financing ${price} moves debt-to-income to ${formatPercent(metrics.debtToIncomeAfter ?? 0)}.`,
    tradeOff: "A new payment competes with your savings goals.",
    smartMove: "Compare the total cost before you submit a credit application.",
  };
}

/** Math first, words second. Any LLM failure or guardrail rejection returns the template card. */
export async function generateCopilotCard(
  llm: LlmClient,
  context: CopilotContext,
  metrics: CopilotMetrics,
): Promise<CopilotCard> {
  const fallback = templateCard(context, metrics);
  try {
    // STUB(copilot-backend): tune this prompt. Figures are passed in as fixed inputs.
    const raw = await llm.generate({
      tier: "flash",
      system:
        "You write a Copilot card with three short parts: impact, tradeOff, smartMove. " +
        "Under 60 words in total. Use only the figures provided. Never invent or alter a number. " +
        "Suggest, never instruct. Return JSON.",
      prompt: JSON.stringify({ context, figures: fallback.keyFigures }),
    });
    const parsed = JSON.parse(raw) as Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">;
    const allowed = [formatUsd(context.priceCents), ...fallback.keyFigures.map((f) => f.value)];
    const verdict = validateCard(parsed, allowed);
    if (!verdict.ok) return fallback;
    return { ...parsed, keyFigures: fallback.keyFigures, source: "llm" };
  } catch {
    return fallback;
  }
}
