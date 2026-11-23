import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { GoalsClient } from "./GoalsClient";

export default async function GoalsPage() {
  const [goals, run, accounts, milestones, funding, allocation] = await Promise.all([
    api.listGoals(),
    api.runSimulation({ body: { persist: false } }),
    api.listAccounts(),
    // The marks are a bonus, not the page.
    api.getGoalMilestones().catch(() => []),
    api.getGoalFunding().catch(() => null),
    api.getGoalAllocation().catch(() => null),
  ]);

  return <>
    <PageHeader title="Goals" />
    <GoalsClient goals={goals} outcomes={run.goalOutcomes} milestones={milestones} funding={funding} allocation={allocation} accounts={accounts} />
  </>;
}
