import type { Situation } from "@finvantage/contracts";
import { api } from "@/lib/api";
import { personalPrompts } from "@/lib/advisorPrompts";
import { AdvisorClient } from "./AdvisorClient";

type Params = { [key: string]: string | string[] | undefined };

const one = (value: string | string[] | undefined) => (typeof value === "string" && value ? value : null);

/**
 * `/advisor?c=<id>` reopens a conversation. `?copilotEvent=<id>` and `?run=<id>` start a new one
 * about that Copilot scan or simulation run.
 */
export default async function AdvisorPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const copilotEvent = one(params.copilotEvent);
  const run = one(params.run);
  const situation: Situation | null = copilotEvent
    ? { kind: "copilot_event", eventId: copilotEvent }
    : run
      ? { kind: "simulation_change", runId: run }
      : null;
  // Questions about what is flagged in the user's own data. A nicety: if any call fails, there are none.
  const [budgets, subscriptions, categories] = await Promise.all([
    api.listBudgets().catch(() => []),
    api.listSubscriptions().catch(() => null),
    api.listSpendingCategories().catch(() => []),
  ]);
  const labels = new Map(categories.map((c) => [c.id, c.label]));
  const prompts = personalPrompts({
    budgets,
    subscriptions: subscriptions ? [...subscriptions.subscriptions, ...subscriptions.bills] : [],
    categoryLabel: (id) => labels.get(id) ?? id,
  });
  return <AdvisorClient initialConversationId={one(params.c)} situation={situation} personalPrompts={prompts} />;
}
