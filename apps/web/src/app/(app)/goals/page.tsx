import { formatUsd, type Goal, type GoalOutcome } from "@finvantage/contracts";
import { ProbabilityRange } from "@/components/finance/ProbabilityRange";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

function GoalCard({ goal, outcome }: { goal: Goal; outcome?: GoalOutcome }) {
  const progress = Math.min(100, (goal.currentCents / goal.targetCents) * 100);
  const isFlexible = goal.flexibility === "flexible";

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold" style={{ color: "var(--ink)" }}>{goal.name}</h3>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium shrink-0"
          style={{ background: isFlexible ? "var(--good-bg)" : "var(--accent-soft, #eceeff)", color: isFlexible ? "var(--good)" : "var(--accent)" }}>
          {isFlexible ? "Flexible" : "Fixed"}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
            {formatUsd(goal.currentCents)}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
            of {formatUsd(goal.targetCents)} goal
          </p>
        </div>
        <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div className="h-2.5 rounded-full transition-all"
          style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--accent) 0%, #818cf8 100%)" }} />
      </div>

      <p className="mt-2.5 text-xs" style={{ color: "var(--ink-muted)" }}>
        Target date: <strong style={{ color: "var(--ink)" }}>{goal.targetDate}</strong>
      </p>

      {outcome && (
        <div className="mt-3 rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
          <ProbabilityRange low={outcome.probabilityLow} high={outcome.probabilityHigh} />
        </div>
      )}
    </Card>
  );
}

export default async function GoalsPage() {
  const [goals, run] = await Promise.all([
    api.listGoals(),
    api.runSimulation({ body: { persist: false } }),
  ]);

  return (
    <>
      <PageHeader title="Goals" />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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
