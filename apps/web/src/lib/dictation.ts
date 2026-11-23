/**
 * Cleans up what a speech engine hears so the Advisor reads it the way the user meant it.
 * Wording only: it never computes or changes a figure's value. "28 grand" and "$28,000" are
 * the same amount said two ways. Anything it does not recognise passes through untouched.
 */

const ACRONYMS: Array<[RegExp, string]> = [
  [/\b(?:four|4) ?(?:oh|o|zero|0) ?(?:one|1) ?k\b/gi, "401(k)"],
  [/\b401 ?k\b/gi, "401(k)"],
  [/\b(?:four|4) ?(?:oh|o|zero|0) ?(?:three|3) ?b\b/gi, "403(b)"],
  [/\b403 ?b\b/gi, "403(b)"],
  [/\broth ira\b/gi, "Roth IRA"],
  [/\bira\b/gi, "IRA"],
  [/\bhsa\b/gi, "HSA"],
  [/\bapr\b/gi, "APR"],
  [/\bapy\b/gi, "APY"],
  [/\bfico\b/gi, "FICO"],
  [/\bs and p 500\b/gi, "S&P 500"],
  [/\bs&p ?500\b/gi, "S&P 500"],
];

/** "7.49 percent" -> "7.49%" */
const PERCENT = /(\d+(?:\.\d+)?)\s*(?:percent|per cent)\b/gi;
/** "28,000 dollars" or "28000 dollars" -> "$28,000" */
const DOLLARS = /(?<![$\d.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(?:dollars|bucks)\b/gi;
/** "28 grand" or "1.5 grand" -> "$28,000" / "$1,500" */
const GRAND = /(?<![$\d.,])(\d+(?:\.\d+)?)\s*(?:grand|k)\b(?!\))/gi;

function withCommas(whole: string): string {
  return Number(whole).toLocaleString("en-US");
}

export function cleanTranscript(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of ACRONYMS) out = out.replace(pattern, replacement);
  out = out.replace(PERCENT, "$1%");
  out = out.replace(DOLLARS, (_m, whole: string, cents?: string) => `$${withCommas(whole.replace(/,/g, ""))}${cents ?? ""}`);
  out = out.replace(GRAND, (_m, amount: string) => `$${withCommas(String(Math.round(Number(amount) * 1000)))}`);
  return out;
}

/** Joins dictated text onto what was already typed, with one space between them. */
export function appendDictation(base: string, dictated: string): string {
  const spoken = dictated.trim();
  if (!spoken) return base;
  if (!base.trim()) return spoken;
  return `${base.replace(/\s+$/, "")} ${spoken}`;
}
