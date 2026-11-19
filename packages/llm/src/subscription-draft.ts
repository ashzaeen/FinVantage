import type { SubscriptionDraftAction } from "@finvantage/contracts";
import type { LlmClient } from "./client";
import { plain, validateNumbers, withoutNames, wordCount } from "./guardrails";

/*
 * Drafted messages about a subscription: a cancellation, a request for a lower bill, or a dispute
 * of a charge after cancelling. FinVantage never sends them; the user reads one and sends it
 * themselves.
 *
 * Every figure in a message is a string the API formatted from the user's own charges. The
 * template uses only those strings, and a model's wording is used only if every number in it
 * appears in them (the math-first guardrail), it is short, and it carries no link, address,
 * threat or claim about what is fair. On any failure the template is used, so the page is never
 * empty.
 */

/** A message is longer than a Copilot card, so it has its own cap. */
export const MAX_DRAFT_WORDS = 120;
const DRAFT_TIMEOUT_MS = 8_000;

export interface SubscriptionDraftInput {
  action: SubscriptionDraftAction;
  /** As the bank names it. */
  merchant: string;
  /** What it charges now, formatted, such as "$15.49". */
  amount: string;
  /** "a month", "a year", "each billing period". */
  cadence: string;
  /** lower_bill: what it used to charge. */
  previousAmount: string | null;
  /** lower_bill: the date of the first charge at the new price, written out, such as "October 3, 2026". */
  changedOn: string | null;
  /** dispute: the day the user cancelled. */
  cancelledOn: string | null;
  /** dispute: the charge that posted afterwards. */
  chargedOn: string | null;
  chargedAmount: string | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `2026-10-03` as `October 3, 2026`, read from the text so a time zone cannot move the day. */
export function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const name = MONTH_NAMES[Number(month) - 1];
  return name && year && day ? `${name} ${Number(day)}, ${year}` : iso;
}

function need(value: string | null, field: string): string {
  if (value === null) throw new Error(`Subscription draft needs ${field}.`);
  return value;
}

/** The standard message with the figures filled in. Complete on its own. */
export function templateDraft(input: SubscriptionDraftInput): string {
  const { merchant, amount, cadence } = input;
  switch (input.action) {
    case "cancel":
      return [
        "Hello,",
        `Please cancel my ${merchant} subscription effective immediately and do not charge me again. I currently pay ${amount} ${cadence}.`,
        "Please confirm the cancellation in writing, and tell me the date of my last charge.",
        "Thank you.",
      ].join("\n\n");
    case "lower_bill":
      return [
        "Hello,",
        `I have been paying for ${merchant}, and my charge went from ${need(input.previousAmount, "the previous amount")} to ${amount} on ${need(input.changedOn, "the date of the change")}. I would like to stay a customer if the price can come back down.`,
        "Could you lower my rate, or tell me about any plan or offer that would reduce it?",
        "Thank you.",
      ].join("\n\n");
    case "dispute":
      return [
        "Hello,",
        `I cancelled my ${merchant} subscription on ${need(input.cancelledOn, "the cancellation date")}, but I was charged ${need(input.chargedAmount, "the amount charged")} on ${need(input.chargedOn, "the date of the charge")}.`,
        "Please refund that charge, and confirm in writing that my subscription is cancelled and I will not be billed again.",
        "Thank you.",
      ].join("\n\n");
  }
}

/** Every figure a message may contain. */
function allowedFigures(input: SubscriptionDraftInput): string[] {
  return [input.amount, input.previousAmount, input.changedOn, input.cancelledOn, input.chargedOn, input.chargedAmount].filter((f): f is string => f !== null);
}

const THREATS = /\b(?:lawyers?|attorneys?|sue|suing|lawsuit|legal action|chargebacks?|report you|fraud)\b/i;
const FAIRNESS_CLAIMS = /\b(?:unfair|overcharg\w*|rip[- ]?off|competitors?|cheaper elsewhere)\b/i;
const LINK_OR_ADDRESS = /@|https?:|www\./i;

/** Why a model's message cannot be used, or null if it can. */
export function draftProblem(text: string, input: SubscriptionDraftInput): string | null {
  if (text.trim() === "") return "empty";
  if (wordCount(text) > MAX_DRAFT_WORDS) return "over word limit";
  if (LINK_OR_ADDRESS.test(text)) return "link or address";
  const threat = plain(text).match(THREATS);
  if (threat) return `threat: "${threat[0]}"`;
  const claim = plain(text).match(FAIRNESS_CLAIMS);
  if (claim) return `claim about fairness: "${claim[0]}"`;
  const numbers = validateNumbers(withoutNames(plain(text), [input.merchant]), allowedFigures(input));
  return numbers.ok ? null : numbers.reason;
}

const SYSTEM_PROMPT = [
  "You write a short message from a customer to a company about their own subscription. The customer will read it and send it themselves.",
  "Write in the first person: polite, direct, plain text with no markdown, a greeting and a closing, under 100 words.",
  "Use only the figures and dates in `figures`, written exactly as given. Never add other numbers, account numbers, phone numbers, email addresses, links or names.",
  "Never threaten legal action, a chargeback or a report. Never say the price is unfair or that other companies charge less. Do not promise anything the customer did not say.",
  "Ask for what `action` says: cancel (cancel now, no further charges, confirm in writing), lower_bill (ask them to lower the rate or offer a cheaper plan), dispute (refund a charge made after cancelling and confirm in writing).",
].join(" ");

const DRAFT_SCHEMA = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
};

export interface GeneratedDraft {
  text: string;
  source: "model" | "template";
}

export async function generateSubscriptionDraft(llm: LlmClient, input: SubscriptionDraftInput): Promise<GeneratedDraft> {
  const fallback: GeneratedDraft = { text: templateDraft(input), source: "template" };
  const useTemplate = (reason: string): GeneratedDraft => {
    // The mock provider always throws by design, so only a real provider's failure is worth a line.
    if (llm.provider !== "mock") console.warn(`Subscription draft: template used (${reason})`);
    return fallback;
  };

  // Only what the message needs. No account, balance, card or personal detail is sent.
  const prompt = JSON.stringify({
    action: input.action,
    company: input.merchant,
    figures: {
      amount: input.amount,
      cadence: input.cadence,
      previousAmount: input.previousAmount,
      changedOn: input.changedOn,
      cancelledOn: input.cancelledOn,
      chargedOn: input.chargedOn,
      chargedAmount: input.chargedAmount,
    },
    exampleMessage: fallback.text,
  });

  let text: string;
  try {
    const raw = await llm.generate({
      tier: "flash",
      timeoutMs: DRAFT_TIMEOUT_MS,
      thinking: "minimal",
      system: SYSTEM_PROMPT,
      jsonSchema: DRAFT_SCHEMA,
      prompt,
    });
    const parsed = JSON.parse(raw) as { text?: unknown };
    if (typeof parsed.text !== "string") return useTemplate("no text in the reply");
    text = parsed.text.trim();
  } catch (error) {
    return useTemplate(error instanceof Error ? error.message : String(error));
  }

  const problem = draftProblem(text, input);
  return problem ? useTemplate(problem) : { text, source: "model" };
}
