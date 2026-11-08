import {
  LifeEventDraft,
  LifeEventType,
  type LifeEventType as LifeEventKind,
  type ParseLifeEventResponse,
} from "@finvantage/contracts";
import type { LlmClient } from "./client";

const NO_MATCH: ParseLifeEventResponse = {
  matched: false,
  message: "I could not match that to a supported life event and a date.",
  supportedTypes: LifeEventType.options,
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function findType(text: string): LifeEventKind | null {
  const value = text.toLowerCase();
  if (/\b(child|baby|having a baby|newborn|adopt(?:ing|ed)? a child)\b/.test(value)) return "child";
  if (/\b(house|home)\s*(purchase|buy|buying)|\b(buy|buying|purchase)\s+(?:a\s+)?(?:house|home)\b/.test(value)) return "house_purchase";
  if (/\b(job|career|work)s?\s*(change|switch)|\b(change|switch|changing)\s+(?:my\s+)?(?:job|career)s?\b/.test(value)) return "job_change";
  if (/\b(move|moving|relocat(?:e|ing|ion))\b/.test(value)) return "move";
  return null;
}

function findDate(text: string, today: string): string | null {
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
  }
  const lower = text.toLowerCase();
  const monthMatches = MONTHS.map((month, index) => {
    const pattern = new RegExp(`\\b${month}\\b`, "g");
    const matches = [...lower.matchAll(pattern)];
    return matches.filter((match) => {
      if (month !== "may") return true;
      const before = lower.slice(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
      const after = lower.slice((match.index ?? 0) + month.length, (match.index ?? 0) + month.length + 8);
      return /\b(in|on|by|around|this|next)\s+$/.test(before) || /^\s+\d{1,2}(?:st|nd|rd|th)?\b/.test(after);
    }).map((match) => ({ index, position: match.index ?? 0 }));
  }).flat().sort((left, right) => left.position - right.position);
  const monthIndex = monthMatches[0]?.index ?? -1;
  if (monthIndex < 0) {
    const relative = lower.match(/\b(next year|in (\d{1,2}) months?|next month)\b/);
    if (!relative) return null;
    const [year, month] = today.split("-").map(Number);
    const offset = relative[2] ? Number(relative[2]) : relative[1].startsWith("next year") ? 12 : 1;
    return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
  }

  const monthPosition = monthMatches[0].position;
  const dayMatch = lower.slice(monthPosition).match(new RegExp(`^${MONTHS[monthIndex]}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const yearMatch = lower.match(new RegExp(`\\b${MONTHS[monthIndex]}(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?,?\\s+(20\\d{2})\\b`));
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const day = dayMatch ? Number(dayMatch[1]) : monthIndex === todayMonth - 1 ? todayDay : 1;
  let year = yearMatch ? Number(yearMatch[1]) : todayYear;
  if (!yearMatch && (monthIndex < todayMonth - 1 || (monthIndex === todayMonth - 1 && day < todayDay))) year += 1;
  const result = new Date(Date.UTC(year, monthIndex, day));
  if (result.getUTCMonth() !== monthIndex || result.getUTCDate() !== day) return null;
  return result.toISOString().slice(0, 10);
}

function findImpact(text: string): number {
  const amount = text.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/);
  if (!amount) return 0;
  const dollars = Number(amount[1].replaceAll(",", ""));
  const cents = Number((amount[2] ?? "").padEnd(2, "0"));
  const magnitude = Math.round(dollars * 100) + cents;
  const lower = text.toLowerCase();
  const income = /\b(raise|salary increase|earn more|income increase|take-home increase|increase in income|monthly pay increase)\b/.test(lower);
  return income ? magnitude : -magnitude;
}

function findRecurrence(text: string): "one_time" | "recurring" {
  return /\b(per month|a month|each month|monthly|per year|a year|annual(?:ly)?)\b/i.test(text) ? "recurring" : "one_time";
}

function findDuration(text: string, recurrence: "one_time" | "recurring"): number | null {
  if (recurrence === "one_time" || /\b(ongoing|indefinite|until changed|from then on)\b/i.test(text)) return null;
  const match = text.match(/\bfor\s+(\d{1,3})\s+(months?|years?)\b/i);
  if (!match) return null;
  const months = Number(match[1]) * (/year/i.test(match[2]) ? 12 : 1);
  return months > 0 && months <= 600 ? months : null;
}

function draftFromText(text: string, today: string, type: LifeEventKind): ParseLifeEventResponse {
  const date = findDate(text, today);
  if (!date || date < today) return NO_MATCH;
  const recurrence = findRecurrence(text);
  const amount = findImpact(text);
  const parsed = LifeEventDraft.safeParse({
    type,
    date,
    recurrence,
    dollarImpactCents: amount,
    durationMonths: findDuration(text, recurrence),
    linkedGoalId: null,
    source: "parsed",
  });
  return parsed.success ? { matched: true, draft: parsed.data } : NO_MATCH;
}

/** Parse a dated event into an unsaved draft. User-confirmation is always required to save it. */
export async function parseLifeEvent(
  llm: LlmClient,
  text: string,
  today: string,
): Promise<ParseLifeEventResponse> {
  const type = findType(text);
  if (type) return draftFromText(text, today, type);

  // Gemini may help recognize the event category, while all dates and money still come from
  // explicit text. The mock provider throws, which cleanly falls back to the safe no-match state.
  try {
    const raw = await llm.generate({
      tier: "flash",
      system: `Classify the user's sentence as exactly one supported life-event type: ${LifeEventType.options.join(", ")}. Return JSON with a type field only. If none fit, return {"type":"none"}. Do not infer dates or financial amounts.`,
      prompt: text,
      jsonSchema: { type: "object", properties: { type: { type: "string", enum: [...LifeEventType.options, "none"] } }, required: ["type"], additionalProperties: false },
      timeoutMs: 2_000,
      thinking: "minimal",
    });
    const value = JSON.parse(raw) as { type?: unknown };
    const modelType = LifeEventType.safeParse(value.type);
    return modelType.success ? draftFromText(text, today, modelType.data) : NO_MATCH;
  } catch {
    return NO_MATCH;
  }
}
