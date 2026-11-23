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
import { buttonClass } from "@/components/ui/Button";

/**
 * Where the monthly savings go, goal by goal, in priority order, and, when a fixed-date goal is
 * short, a suggested new order shown as before and after bars. What each goal still needs is on
 * its own card, so it is not repeated here. The order only changes after Confirm; no money moves.
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
  const neededOf = new Map(allocation.rows.map((r) => [r.goalId, r.neededCents]));
  const anyShort = allocation.rows.some((r) => r.shortCents > 0);

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

      {rebalance ? (
        <div className="mt-5 rounded-xl border border-line bg-inset p-4">
          <h3 className="text-sm font-semibold text-ink">A Suggested Reorder</h3>
          <p className="mt-1 text-sm text-ink">
            Consider ranking <strong>{rebalance.receiverName}</strong> above <strong>{rebalance.donorName}</strong>. That moves about <strong>{formatUsd(rebalance.movedCents)}</strong> a month to {rebalance.receiverName}, so it lands on its date.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {rebalance.effects.map((e) => {
              const needed = neededOf.get(e.goalId) ?? 0;
              const share = (cents: number) => (needed > 0 ? cents / needed : 0);
              const worse = e.afterCents < e.beforeCents;
              return (
                <li key={e.goalId} className="min-w-0 space-y-2">
                  <p className="truncate text-sm font-semibold text-ink">{e.name}</p>
                  <BulletBar label="Now" valueText={`${formatUsd(e.beforeCents)} a month`} fill={share(e.beforeCents)} target={1} tone="accent" />
                  <BulletBar
                    label="With the new order"
                    valueText={`${formatUsd(e.afterCents)} a month`}
                    fill={share(e.afterCents)}
                    target={1}
                    tone={worse ? "warn" : "in"}
                    note={worse ? (e.delayMonths === null ? "Paused" : e.delayMonths > 0 ? `About ${plural(e.delayMonths, "month")} later than its date` : "Still on time") : "Lands on its date"}
                  />
                </li>
              );
            })}
          </ul>
          {step === "idle" && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setStep("preview")} className={buttonClass({ variant: "primary" })}>Apply This Plan</button>
            </div>
          )}
          {(step === "preview" || step === "saving") && (
            <div role="group" aria-label="Confirm the new order" className="mt-4 rounded-xl border border-line bg-raised p-3">
              <p className="text-sm font-semibold text-ink">Change your goal order?</p>
              <p className="mt-1 text-xs text-muted">This changes the priority rank of {plural(rebalance.newRanks.length, "goal")}: {rebalance.newRanks.map((r) => `${goals.find((g) => g.id === r.goalId)?.name ?? "A goal"} to #${r.priorityRank}`).join(", ")}. No money moves. You can change the order back at any time.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={step === "saving"} onClick={() => void apply()} className={buttonClass({ variant: "primary" })}>{step === "saving" ? "Saving…" : "Confirm"}</button>
                <button type="button" disabled={step === "saving"} onClick={() => setStep("idle")} className={buttonClass({ variant: "quiet" })}>Not Now</button>
              </div>
            </div>
          )}
          {step === "done" && <p role="status" className="mt-3 text-sm text-ink">Order changed.</p>}
          {error && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--critical)" }}>{error}</p>}
        </div>
      ) : anyShort ? (
        <p className="mt-4 text-xs text-muted">Some goals are short each month, shown on their cards. Reordering would not help a fixed-date goal here. To change what each goal gets, adjust its priority or date, or raise what you set aside.</p>
      ) : null}

      <p className="mt-4 text-xs text-muted">Each goal gets what it needs each month to land on its date, in priority order, until the money runs out. It ignores growth and interest, so the simulated odds can read higher.</p>
    </Card>
  );
}
