import { z } from "zod";

/**
 * Speaking an Advisor reply. The request names a saved reply, never free text, so the endpoint
 * can only voice an answer that already passed the Advisor's number guardrail.
 */
export const SpeakRequest = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  /** Which chunk of the reply, from 0. The first response says how many there are. */
  part: z.number().int().min(0).max(40).default(0),
});
export type SpeakRequest = z.input<typeof SpeakRequest>;

export const SpeakResponse = z.object({
  /** The audio, base64. A WAV file, so an audio element plays it as it is. */
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  part: z.number().int().min(0),
  parts: z.number().int().min(1),
});
export type SpeakResponse = z.infer<typeof SpeakResponse>;

/** Plain speech from an Advisor reply: markdown, bullets and headings removed. */
export function spokenText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/`/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * How text sounds best read aloud: "$1,240.50" as "1,240 dollars and 50 cents", "7.49%" as
 * "7.49 percent", "2028-03-01" as "March 1, 2028". It changes only how a figure is written, never
 * its value. The saved reply and the captions keep the exact text, and the number guardrail has
 * already checked it, so this is applied to audio alone.
 */
export function speakable(text: string): string {
  return text
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, y: string, m: string, d: string) =>
      +m >= 1 && +m <= 12 ? `${MONTH_NAMES[+m - 1]} ${+d}, ${y}` : match,
    )
    .replace(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)%/g, "$1 to $2 percent")
    .replace(/(\d+(?:\.\d+)?)%/g, "$1 percent")
    .replace(/(-)?\$(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?!\d)/g, (_m, minus: string | undefined, whole: string, cents?: string) => {
      const dollars = Number(whole.replace(/,/g, ""));
      const c = cents ? Number(cents) : 0;
      const parts: string[] = [];
      if (dollars > 0 || c === 0) parts.push(`${whole} ${dollars === 1 ? "dollar" : "dollars"}`);
      if (c > 0) parts.push(`${c} ${c === 1 ? "cent" : "cents"}`);
      return `${minus ? "minus " : ""}${parts.join(" and ")}`;
    });
}

/**
 * Splits a reply into chunks to speak one after another. The first chunk is one sentence, so
 * audio starts quickly; later chunks hold several sentences up to `maxChars`. The server and the
 * browser fallback both use this, so part numbers always agree.
 */
export function speechChunks(text: string, maxChars = 240): string[] {
  const plain = spokenText(text);
  if (!plain) return [];
  // A full stop followed by a digit ("$1,240.50") is not a sentence end, so split on spaces only.
  const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
  const [first, ...rest] = sentences;
  const chunks = [first!];
  for (const sentence of rest) {
    const last = chunks.length > 1 ? chunks[chunks.length - 1]! : "";
    if (last && last.length + 1 + sentence.length <= maxChars) chunks[chunks.length - 1] = `${last} ${sentence}`;
    else chunks.push(sentence);
  }
  return chunks;
}
