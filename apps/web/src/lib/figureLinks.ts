/** A piece of an answer: plain text, or a figure that has a working behind it. */
export interface FigureSegment<C> {
  text: string;
  /** Set when this figure matches the result of a calculation. */
  calc?: C;
}

const FIGURE = /(\$\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?%)/g;
const norm = (s: string) => s.replace(/\s+/g, "");

/**
 * Splits an answer into text and figures. A figure is tappable only when a calculation's result
 * contains it, so a number with no working behind it is never dressed up as one. Pure: it reads
 * the text and the calculations the app already worked out, and computes nothing.
 */
export function splitFigures<C extends { result: string }>(text: string, calcs: readonly C[]): FigureSegment<C>[] {
  if (calcs.length === 0) return [{ text }];
  const out: FigureSegment<C>[] = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE)) {
    const token = match[0];
    const at = match.index ?? 0;
    const calc = calcs.find((c) => norm(c.result).includes(norm(token)));
    if (!calc) continue;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: token, calc });
    last = at + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
