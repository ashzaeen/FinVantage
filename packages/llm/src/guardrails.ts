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

/** Numbers small enough to be counts, list markers, or months; always allowed in chat. */
const SMALL_NUMBER_LIMIT = 12;

function canonical(number: string): string {
  const value = Number(number.replaceAll(",", ""));
  return Number.isFinite(value) ? String(value) : number;
}

function addAmount(out: Set<string>, value: number) {
  out.add(canonical(String(value)));
  out.add(canonical(value.toFixed(2)));
  out.add(String(Math.round(value)));
  out.add(String(Math.floor(value)));
  out.add(String(Math.ceil(value)));
}

/**
 * Every figure a model may repeat after seeing `value`: each number in its strings, each number
 * value, and the forms a writer would use for it. A `...Cents` field also counts in dollars, and a
 * fraction between 0 and 1 also counts as a percentage, so `0.62` allows "62%".
 */
export function groundedFigures(value: unknown, out = new Set<string>(), key = ""): Set<string> {
  if (typeof value === "string") {
    for (const n of numbersIn(value)) out.add(canonical(n));
  } else if (typeof value === "number" && Number.isFinite(value)) {
    const abs = Math.abs(value);
    // A cents field grounds its dollar forms only, so "$56,883" never passes for $568.83.
    if (/cents$/i.test(key)) addAmount(out, abs / 100);
    else addAmount(out, abs);
    if (abs > 0 && abs < 1) addAmount(out, abs * 100);
  } else if (Array.isArray(value)) {
    for (const item of value) groundedFigures(item, out, key);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) groundedFigures(v, out, k);
  }
  return out;
}

export const MAX_CHAT_WORDS = 250;

/**
 * Numbers that are part of a well-known financial name, not figures: indexes and account types.
 * "S&P 500" is a name whether or not the user has $500.
 */
const FINANCIAL_NAMES = new RegExp(
  String.raw`\b(?:S\s*&\s*P\s*(?:500|400|600|1500)|Nasdaq(?:[-\s]?100|[-\s]Composite)?|Russell\s*(?:1000|2000|3000)|Dow(?:\s+Jones)?\s*30|Wilshire\s*5000|FTSE\s*(?:100|250)|Nikkei\s*225|DAX\s*40|Euro\s*Stoxx\s*50|MSCI\s*\w+|(?:401|403|457)\s*\(?[kb]\)?|529(?:\s+plan)?|Section\s+\d+)`,
  "gi",
);

/** The text with well-known financial names removed, so their numbers aren't read as figures. */
export function withoutFinancialNames(text: string): string {
  return text.replace(FINANCIAL_NAMES, " ");
}

/**
 * A grounded number for a tool's input: exactly one the model was given, or a small count. Tools
 * use this so a calculation or a scenario can never be fed an invented amount.
 */
export function isGroundedNumber(value: number, allowed: Set<string>): boolean {
  const n = Math.abs(value);
  return (Number.isInteger(n) && n <= SMALL_NUMBER_LIMIT) || n === 100 || allowed.has(canonical(String(n)));
}

/** A rounded figure still counts as the real one within this share, or within a dollar. */
export const MONEY_TOLERANCE = 0.03;

const MULTIPLIER: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** Every dollar amount in the text, as a number of dollars: "$570", "$9.1k", "$1.2 million", "570 dollars". */
export function moneyIn(text: string): Array<{ text: string; dollars: number }> {
  const found: Array<{ text: string; dollars: number }> = [];
  const value = (digits: string, unit?: string) => Number(digits.replaceAll(",", "")) * (unit ? (MULTIPLIER[unit.toLowerCase()] ?? 1) : 1);
  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|mm|m|million|bn|b|billion)\b)?/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  for (const m of text.matchAll(/(?<![$\d.,])\b(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|million|billion))?\s+(?:US\s+)?dollars?\b/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  return found;
}

/** Whether a dollar amount matches a given figure, allowing for rounding. */
function matchesFigure(dollars: number, figures: number[]): boolean {
  return figures.some((f) => Math.abs(dollars - f) <= Math.max(1, f * MONEY_TOLERANCE));
}

/**
 * The chat answer check, narrowed to money. Every dollar amount must match a figure the model was
 * given (the brief, a tool result, a web search, or the user's words), allowing for rounding.
 * Plain numbers and percentages are not checked, so general advice ("under 30%", "7 years") and
 * counts read naturally. Tool inputs stay exact through `isGroundedNumber`.
 */
export function validateGrounded(
  text: string,
  allowed: Set<string>,
): { ok: true } | { ok: false; reason: string; invented: string[] } {
  if (wordCount(text) > MAX_CHAT_WORDS) return { ok: false, reason: "over word limit", invented: [] };
  const figures = [...allowed].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const invented = [...new Set(moneyIn(text).filter((m) => m.dollars > 0 && !matchesFigure(m.dollars, figures)).map((m) => m.text.trim()))];
  return invented.length > 0
    ? { ok: false, reason: `unknown amounts: ${invented.join(", ")}`, invented }
    : { ok: true };
}

/**
 * The answer without the sentences that hold an unchecked amount. Null when too little is left
 * to be worth showing.
 */
export function withoutSentences(text: string, invented: string[]): string | null {
  if (invented.length === 0) return text;
  const kept = text
    .split("\n")
    .map((line) => line.split(/(?<=[.!?])\s+/).filter((s) => !invented.some((amount) => s.includes(amount))).join(" "))
    .filter((line, i, lines) => line.trim() !== "" || (i > 0 && lines[i - 1]!.trim() !== ""))
    .join("\n")
    .trim();
  return wordCount(kept) >= 12 ? kept : null;
}
