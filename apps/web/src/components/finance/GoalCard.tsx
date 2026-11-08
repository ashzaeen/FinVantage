import { formatUsd, type Goal, type GoalOutcome } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { ProbabilityRange } from "./ProbabilityRange";

export function GoalCard({ goal, outcome }: { goal: Goal; outcome?: GoalOutcome }) {
  const progress = Math.min(100, (goal.currentCents / goal.targetCents) * 100);
  const isFlexible = goal.flexibility === "flexible";

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold" style={{ color: "var(--ink)" }}>{goal.name}</h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium shrink-0"
          style={{
            background: isFlexible ? "var(--good-bg)" : "#eceeff",
            color: isFlexible ? "var(--good)" : "var(--accent)",
          }}
        >
          {isFlexible ? "Flexible" : "Fixed"}
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
        {formatUsd(goal.currentCents)}
      </p>
      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
        of {formatUsd(goal.targetCents)} goal
      </p>

      {/* Progress bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div
          className="h-2.5 rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--accent) 0%, #818cf8 100%)",
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--ink-muted)" }}>By {goal.targetDate}</p>
        <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
          {Math.round(progress)}%
        </span>
      </div>

      {outcome && (
        <div className="mt-3 rounded-xl p-3" style={{ background: "var(--surface-inset)" }}>
          <ProbabilityRange low={outcome.probabilityLow} high={outcome.probabilityHigh} />
        </div>
      )}
    </Card>
  );
}
