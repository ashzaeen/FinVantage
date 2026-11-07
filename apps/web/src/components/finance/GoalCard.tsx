import { formatUsd, type Goal, type GoalOutcome } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { ProbabilityRange } from "./ProbabilityRange";

export function GoalCard({ goal, outcome }: { goal: Goal; outcome?: GoalOutcome }) {
  const progress = Math.min(100, (goal.currentCents / goal.targetCents) * 100);

  return (
    <Card title={goal.name}>
      <p className="text-sm tabular-nums">
        {formatUsd(goal.currentCents)} of {formatUsd(goal.targetCents)}
      </p>
      <span className="mt-2 block h-1.5 rounded bg-line">
        <span className="block h-1.5 rounded bg-accent" style={{ width: `${progress}%` }} />
      </span>
      <p className="mt-2 text-xs text-muted">
        By {goal.targetDate} · {goal.flexibility === "flexible" ? "Flexible" : "Non-negotiable"}
      </p>
      {outcome && (
        <div className="mt-3">
          <ProbabilityRange low={outcome.probabilityLow} high={outcome.probabilityHigh} />
        </div>
      )}
    </Card>
  );
}
