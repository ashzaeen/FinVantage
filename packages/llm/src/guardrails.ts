import type { CopilotCard } from "@finvantage/contracts";

export const MAX_CARD_WORDS = 60;

export function cardText(card: Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">): string {
  return `${card.impact} ${card.tradeOff} ${card.smartMove}`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Text as the checks read it. NFKC turns look-alike characters into plain ones, so full-width
 * digits ("２８,０００") can't slip past patterns that only match 0-9 (security review N2).
 */
export function plain(text: string): string {
  return text.normalize("NFKC");
}

export function numbersIn(text: string): string[] {
  return (plain(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replaceAll(",", ""));
}

/**
 * Number words big enough to be an amount. `numbersIn` only sees digits, so without this check
 * "twenty-eight thousand dollars" was invisible to it (security review W2, G1). Words up to twelve
 * stay allowed: they are counts ("two goals", "twelve months"), as in chat.
 */
const SPELLED_AMOUNT = /\b(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/i;

/** A number or small number word followed by a multiplier: "2k", "28 grand", "ten grand", "5 million". */
const MULTIPLIED_AMOUNT = /(?:\d|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|half a|a few|several))\s?(?:k|m|mm|bn|grand|bucks)\b/i;

/** Words that scale an amount without a digit. Checked on cards only; reports use "half" and "quarter" as time. */
const CARD_MULTIPLIER_WORDS = /\b(?:double|triple|twice|half|dozen)\b/i;

export function validateNumbers(
  text: string,
  allowedFigures: string[],
): { ok: true } | { ok: false; reason: string } {
  text = plain(text);
  const spelled = text.match(SPELLED_AMOUNT);
  if (spelled) return { ok: false, reason: `spelled-out number: "${spelled[0]}"` };
  // "$2k" would otherwise pass on the strength of an allowed "2". The math core never writes
  // amounts this way, so any multiplier after a number (or a number word) is refused.
  const multiplied = text.match(MULTIPLIED_AMOUNT);
  if (multiplied) return { ok: false, reason: `shorthand amount: "${multiplied[0]}"` };
  const allowed = new Set(allowedFigures.flatMap(numbersIn));
  // A number keeps the unit it was given with: "1,499" from "$1,499" can't come back as "1,499%".
  const withUnit = (unit: string) => new Set(allowedFigures.filter((f) => plain(f).includes(unit)).flatMap(numbersIn));
  const dollars = withUnit("$");
  const percents = withUnit("%");
  // A number given only as money must be written as money: "599" from "$599" can't become "599 months".
  const moneyOnly = (number: string) =>
    dollars.has(number) && !allowedFigures.some((f) => !plain(f).includes("$") && numbersIn(f).includes(number));
  const invented: string[] = [];
  // Commas only between digits: a sentence comma after a figure ("At $1,200, your bills...") is
  // punctuation, not part of the number. Reading it as "1,200," failed the grouping check below and
  // sent correct cards to the template (found re-running the W2 probe after the second-review fixes).
  for (const m of text.matchAll(/(\$\s?)?(\d+(?:,\d+)*(?:\.\d+)?)(\s?%)?/g)) {
    const number = m[2]!.replaceAll(",", "");
    // Commas must group thousands, so "$14,99" is not read as the allowed 1,499.
    const grouped = !m[2]!.includes(",") || /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(m[2]!);
    if (
      !grouped ||
      !allowed.has(number) ||
      (m[1] && !dollars.has(number)) ||
      (m[3] && !percents.has(number)) ||
      (!m[1] && moneyOnly(number))
    ) {
      invented.push(m[0].trim());
    }
  }
  return invented.length > 0
    ? { ok: false, reason: `unknown figures: ${invented.join(", ")}` }
    : { ok: true };
}

/**
 * The text with each name removed, longest first, ignoring case. A name can hold digits ("0% Promo
 * Card"), and those digits are fine where the name is written. They must not approve the same
 * digits anywhere else: a goal named "Trip 2000" used to let a card invent "$2,000" (W2, G3).
 */
export function withoutNames(text: string, names: string[]): string {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...names]
    .filter((name) => name.trim() !== "")
    .sort((a, b) => b.length - a.length)
    // Only a whole name is removed. A goal named "7" used to delete the 7 from "$71,499" and
    // leave the allowed "1,499" (second review, R2-6 C1 and C2), so a name never matches inside a
    // word or a number, or right after a currency sign.
    .reduce(
      (out, name) =>
        out.replace(new RegExp(`(?<![\\p{L}\\p{N}$€£¥]|\\d[.,])${escape(name)}(?![\\p{L}\\p{N}]|[.,]\\d)`, "giu"), " "),
      text,
    );
}

/**
 * Math-first guardrail: every number in the card must appear in `allowedFigures`, the
 * formatted strings the math core produced. `names` (accounts, cards, goals) may appear in the
 * card, but their digits approve nothing. On any failure the caller uses the template card.
 */
export function validateCard(
  card: Pick<CopilotCard, "impact" | "tradeOff" | "smartMove">,
  allowedFigures: string[],
  names: string[] = [],
): { ok: true } | { ok: false; reason: string } {
  const text = cardText(card);
  if (wordCount(text) > MAX_CARD_WORDS) return { ok: false, reason: "over word limit" };
  const multiplier = withoutNames(plain(text), names).match(CARD_MULTIPLIER_WORDS);
  if (multiplier) return { ok: false, reason: `multiplier word: "${multiplier[0]}"` };

  return validateNumbers(withoutNames(plain(text), names), allowedFigures);
}

/**
 * Phrases that plainly approve a purchase. The math decides the verdict, but that rule lived only
 * in the prompt, so a card could say "great choice, go ahead" on a caution verdict and pass every
 * number check (W2, G2). This is a tripwire for the obvious cases, not a full tone check: a model
 * can approve in other words. Hedged lines the templates use ("If you planned for it, you can
 * afford it") are deliberately not on it.
 */
export const APPROVING_PHRASES =
  /\b(?:go ahead|go for it|(?:great|good|smart|sensible|solid|wise) (?:choice|buy|pick|purchase|idea|deal|news|move)|good to (?:buy|go)|buy it (?:today|now)|(?:is|it's|its) (?:very |quite |easily )?affordable|not a risk|no risk|worth it|you deserve|no problem|nothing to worry|totally fine|perfectly (?:fine|safe|affordable)|fits[\w\s]{0,30}perfectly|easily afford|treat yourself|won'?t hurt|safe to buy|no impact on)\b/i;

/** Whether card text contradicts a verdict the math core decided. */
export function contradictsVerdict(text: string, verdict: string): string | null {
  if (verdict !== "caution") return null;
  // Punctuation between the words ("Go, ahead: a great, choice") must not hide a phrase.
  const words = plain(text).replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ");
  return words.match(APPROVING_PHRASES)?.[0] ?? null;
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
  // Read "28 000" as 28000, and look-alike digits as digits (security review N2).
  text = plain(text).replace(/(?<=\d)[ \u00a0\u202f](?=\d{3}(?!\d))/g, "");
  const found: Array<{ text: string; dollars: number }> = [];
  const value = (digits: string, unit?: string) => Number(digits.replaceAll(",", "")) * (unit ? (MULTIPLIER[unit.toLowerCase()] ?? 1) : 1);
  // Other currency signs count too: the app only holds dollars, so "€28,000" is an amount to check.
  for (const m of text.matchAll(/[$€£¥]\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|mm|m|million|bn|b|billion)\b)?/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  for (const m of text.matchAll(/(?<![$\d.,])\b(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|million|billion))?\s+(?:US\s+)?dollars?\b/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  // The forms below slipped past the check before the security review (W2, G4-G7).
  // "28 grand", "500 bucks"
  for (const m of text.matchAll(/(?<![$\d.,])\b(\d[\d,]*(?:\.\d+)?)\s?(grand|bucks)\b/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!) * (m[2]!.toLowerCase() === "grand" ? 1e3 : 1) });
  }
  // "USD 28,000", "28,000 USD"
  for (const m of text.matchAll(/\bUSD\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|million|billion)\b)?/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  for (const m of text.matchAll(/(?<![$\d.,])\b(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|million|billion))?\s?USD\b/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  // A bare "28k" (no $). Not when a non-money unit follows ("28k miles"), and not when a form
  // above already counted it ("$28k", "28k dollars", "28k USD").
  for (const m of text.matchAll(/(?<![$\d.,]|\$\s|USD\s)\b(\d[\d,]*(?:\.\d+)?)\s?k\b(?!\s+(?:US\s+)?dollars?\b|\s?USD\b|\s+(?:miles?|mi|km|steps|users|followers|views|subscribers|words|calories|people)\b)/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, "k") });
  }
  // "28 thousand" with no unit at all, unless a non-money unit follows.
  for (const m of text.matchAll(/(?<![$€£¥\d.,]|[$€£¥]\s|USD\s)\b(\d[\d,]*(?:\.\d+)?)\s(thousand|million|billion)\b(?!\s+(?:US\s+)?dollars?\b|\s?USD\b|\s+(?:miles?|mi|km|steps|users|followers|views|subscribers|words|calories|people|years)\b)/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!, m[2]) });
  }
  // "28,000 in cash", "28,000 in savings"
  for (const m of text.matchAll(/(?<![$€£¥\d.,]|[$€£¥]\s|USD\s)\b(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d+)?\s+in\s+(?:cash|savings|debt)\b/gi)) {
    found.push({ text: m[0], dollars: value(m[1]!) });
  }
  // "twenty-eight thousand dollars", "five hundred bucks", "twenty-eight grand"
  for (const m of text.matchAll(SPELLED_MONEY)) {
    const n = wordsToNumber(m[1]!);
    if (n !== null) found.push({ text: m[0], dollars: n * (m[2]!.toLowerCase() === "grand" ? 1e3 : 1) });
  }
  return found;
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
const NUMBER_WORD = `(?:${[...Object.keys(ONES), ...Object.keys(TENS), "hundred", ...Object.keys(SCALES)].join("|")})`;
const SPELLED_MONEY = new RegExp(String.raw`\b(${NUMBER_WORD}(?:(?:[\s-]+|\s+and\s+)${NUMBER_WORD})*)\s+(dollars?|bucks|grand)\b`, "gi");

/** "twenty-eight thousand" is 28000. Null for anything that isn't a plain number phrase. */
export function wordsToNumber(phrase: string): number | null {
  let total = 0;
  let current = 0;
  for (const word of phrase.toLowerCase().split(/[\s-]+/)) {
    if (word === "and") continue;
    if (word in ONES) current += ONES[word]!;
    else if (word in TENS) current += TENS[word]!;
    else if (word === "hundred") current = (current || 1) * 100;
    else if (word in SCALES) {
      total += (current || 1) * SCALES[word]!;
      current = 0;
    } else return null;
  }
  return total + current;
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
  // Names like "401(k)" and "S&P 500" go first, so "401k" is never read as $401,000.
  const invented = [...new Set(moneyIn(withoutFinancialNames(text)).filter((m) => m.dollars > 0 && !matchesFigure(m.dollars, figures)).map((m) => m.text.trim()))];
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
