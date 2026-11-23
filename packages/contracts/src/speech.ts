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
