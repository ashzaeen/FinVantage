import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { SimulatorClient } from "./SimulatorClient";

export default async function SimulatorPage() {
  const [goals, lifeEvents] = await Promise.all([api.listGoals(), api.listLifeEvents()]);

  return (
    <>
      <PageHeader title="Simulator" tier="P0" prd="5" />
      <SimulatorClient goals={goals} lifeEvents={lifeEvents} />
    </>
  );
}
