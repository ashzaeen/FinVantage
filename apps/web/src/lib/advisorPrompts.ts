import { formatUsd, type Budget, type Subscription } from "@finvantage/contracts";

export interface PersonalPrompt {
  /** A short tag for the card. */
  label: string;
  /** The question put into the message box. */
  question: string;
}

/** How many suggestions to offer. A few that are about you beat a long list. */
export const MAX_PERSONAL_PROMPTS = 3;

/**
 * Starter questions drawn from what is flagged in the user's own data: a budget over its limit, a
 * subscription that went up, two that do the same job. Every figure in a question is one the API
 * already sent. Nothing is computed here, and nothing is asked until the user presses send.
 */
export function personalPrompts(input: {
  budgets: readonly Pick<Budget, "category" | "status" | "remainingCents" | "spentCents" | "limitCents">[];
  subscriptions: readonly Pick<Subscription, "merchant" | "status" | "kind" | "flags">[];
  categoryLabel: (id: string) => string;
}): PersonalPrompt[] {
  const out: PersonalPrompt[] = [];

  const over = [...input.budgets].filter((b) => b.status === "over").sort((a, b) => a.remainingCents - b.remainingCents)[0];
  if (over) {
    out.push({
      label: "Over Budget",
      question: `My ${input.categoryLabel(over.category)} budget is ${formatUsd(-over.remainingCents)} over its ${formatUsd(over.limitCents)} limit this month. What is going on, and what could I change?`,
    });
  }

  const raised = input.subscriptions
    .filter((s) => s.kind === "subscription" && s.status !== "cancelled")
    .flatMap((s) => s.flags.filter((f) => f.type === "price_up" && f.previousCents !== null && f.currentCents !== null).map((f) => ({ s, f })))[0];
  if (raised) {
    out.push({
      label: "Price Rise",
      question: `${raised.s.merchant} went from ${formatUsd(raised.f.previousCents!)} to ${formatUsd(raised.f.currentCents!)}. Is it still worth keeping?`,
    });
  }

  const duplicate = input.subscriptions.flatMap((s) => s.flags.filter((f) => f.type === "possible_duplicate" && f.group).map((f) => f.group!))[0];
  if (duplicate) {
    out.push({ label: "Doubled Up", question: `I pay for more than one ${duplicate} service. How do I decide which to keep?` });
  }

  return out.slice(0, MAX_PERSONAL_PROMPTS);
}
