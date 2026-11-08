import type { CopilotCard } from "@finvantage/contracts";

export const MAX_CARD_WORDS = 60;

export function cardText(card: Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">): string {
  return `${card.impact} ${card.tradeOff} ${card.smartMove}`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replaceAll(",", ""));
}

export function validateNumbers(
  text: string,
  allowedFigures: string[],
): { ok: true } | { ok: false; reason: string } {
  const allowed = new Set(allowedFigures.flatMap(numbersIn));
  const invented = numbersIn(text).filter((number) => !allowed.has(number));
  return invented.length > 0
    ? { ok: false, reason: `unknown figures: ${invented.join(", ")}` }
    : { ok: true };
}

/**
 * Math-first guardrail: every number in the card must appear in `allowedFigures`, the
 * formatted strings the math core produced. On any failure the caller uses the template card.
 */
export function validateCard(
  card: Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">,
  allowedFigures: string[],
): { ok: true } | { ok: false; reason: string } {
  const text = cardText(card);
  if (wordCount(text) > MAX_CARD_WORDS) return { ok: false, reason: "over word limit" };

  return validateNumbers(text, allowedFigures);
}
