import type { Situation } from "@finvantage/contracts";
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
  return <AdvisorClient initialConversationId={one(params.c)} situation={situation} />;
}
