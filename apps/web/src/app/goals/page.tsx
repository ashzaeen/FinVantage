import { GoalCard } from "@/components/finance/GoalCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function GoalsPage() {
  const [goals, run] = await Promise.all([
    api.listGoals(),
    api.runSimulation({ body: { persist: false } }),
  ]);

  return (
    <>
      <PageHeader title="Goals" tier="P0" prd="4 (#8)" />
      <div className="grid gap-4 md:grid-cols-3">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            outcome={run.goalOutcomes.find((o) => o.goalId === goal.id)}
          />
        ))}
      </div>
    </>
  );
}
