"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatUsd, type Goal, type GoalAllocation } from "@finvantage/contracts";
import { BulletBar } from "@/components/charts/BulletBar";
import { StackedBar } from "@/components/charts/StackedBar";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { seriesColor } from "@/lib/chartColors";
import { plural } from "@/lib/format";

/**
 * Where the monthly savings go, goal by goal, in priority order, and, when a fixed-date goal is
 * short, a suggested new order. The order only changes after Confirm; nothing moves money.
 */
export function GoalAllocationCard({ allocation, goals }: { allocation: GoalAllocation; goals: Goal[] }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "preview" | "saving" | "done">("idle");
  const [error, setError] = useState("");
  const rebalance = allocation.rebalance;
  if (allocation.rows.length === 0) return null;

  const segments = [
    ...allocation.rows.map((r, i) => ({ label: r.name, cents: r.allocatedCents, color: seriesColor(i) })),
    { label: "Not Assigned", cents: allocation.unallocatedCents, color: "var(--ink-muted)", hollow: true },
  ];
  const short = allocation.rows.filter((r) => r.shortCents > 0);

  async function apply() {
    if (!rebalance) return;
    setStep("saving");
    setError("");
    try {
      const ranks = new Map(rebalance.newRanks.map((r) => [r.goalId, r.priorityRank]));
      for (const goal of goals) {
        const rank = ranks.get(goal.id);
        if (rank === undefined) continue;
        const { id, userId: _owner, ...body } = goal;
        await api.updateGoal({ params: { id }, body: { ...body, priorityRank: rank } });
      }
      setStep("done");
      router.refresh();
    } catch (e) {
      setStep("preview");
      setError(e instanceof Error ? e.message : "Could not change the order.");
    }
  }

  return (
    <Card title="Where Your Savings Go" subtitle={`About ${formatUsd(allocation.monthlySavingsCents)} a month, shared in priority order`} lift={false}>
      <StackedBar segments={segments} label="Monthly savings by goal" />

      {short.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink">Goals That Need More</h3>
          <ul className="mt-2 space-y-3">
            {short.map((r, i) => (
              <li key={r.goalId}>
                <BulletBar
                  index={i}
                  label={r.name}
                  valueText={`${formatUsd(r.allocatedCents)} of ${formatUsd(r.neededCents)}`}
                  fill={r.neededCents ? r.allocatedCents / r.neededCents : 0}
                  tone="warn"
                  note={`Short by about ${formatUsd(r.shortCents)} a month to land on its date`}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {rebalance ? (
        <div className="mt-5 rounded-xl border border-line bg-inset p-4">
          <h3 className="text-sm font-semibold text-ink">A Suggested Reorder</h3>
          <p className="mt-1 text-sm text-ink">
            Consider ranking <strong>{rebalance.receiverName}</strong> above <strong>{rebalance.donorName}</strong>. That moves about <strong>{formatUsd(rebalance.movedCents)}</strong> a month to {rebalance.receiverName}, so it lands on its date.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {rebalance.effects.map((e) => (
              <li key={e.goalId}>
                {e.name}: {formatUsd(e.beforeCents)} to {formatUsd(e.afterCents)} a month
                {e.afterCents < e.beforeCents && (e.delayMonths === null ? ", paused" : e.delayMonths > 0 ? `, about ${plural(e.delayMonths, "month")} later than its date` : ", still on time")}.
              </li>
            ))}
          </ul>
          {step === "idle" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setStep("preview")} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>Apply This Plan</button>
            </div>
          )}
          {(step === "preview" || step === "saving") && (
            <div role="group" aria-label="Confirm the new order" className="mt-3 rounded-xl border border-line bg-raised p-3">
              <p className="text-sm font-semibold text-ink">Change your goal order?</p>
              <p className="mt-1 text-xs text-muted">This changes the priority rank of {plural(rebalance.newRanks.length, "goal")}: {rebalance.newRanks.map((r) => `${goals.find((g) => g.id === r.goalId)?.name ?? "A goal"} to #${r.priorityRank}`).join(", ")}. No money moves. You can change the order back at any time.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={step === "saving"} onClick={() => void apply()} className="min-h-11 rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{step === "saving" ? "Saving…" : "Confirm"}</button>
                <button type="button" disabled={step === "saving"} onClick={() => setStep("idle")} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted">Not Now</button>
              </div>
            </div>
          )}
          {step === "done" && <p role="status" className="mt-3 text-sm text-ink">Order changed.</p>}
          {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
        </div>
      ) : short.length > 0 ? (
        <p className="mt-4 text-xs text-muted">Reordering would not help a fixed-date goal here. To change what each goal gets, adjust its priority or date, or raise what you set aside.</p>
      ) : null}

      <p className="mt-4 text-xs text-muted">Each goal gets what it needs each month to land on its date, in priority order, until the money runs out. It ignores growth and interest, so the simulated odds can differ.</p>
    </Card>
  );
}
