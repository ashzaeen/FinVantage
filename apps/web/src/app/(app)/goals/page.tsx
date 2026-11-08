import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { GoalsClient } from "./GoalsClient";

export default async function GoalsPage() {
  const [goals, run, accounts] = await Promise.all([
    api.listGoals(),
    api.runSimulation({ body: { persist: false } }),
    api.listAccounts(),
  ]);

  return <>
    <PageHeader title="Goals" />
    <GoalsClient goals={goals} outcomes={run.goalOutcomes} accounts={accounts} />
  </>;
}
