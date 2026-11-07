import { ACCOUNT_CATEGORY_LABEL, formatUsd } from "@finvantage/contracts";
import { GoalCard } from "@/components/finance/GoalCard";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { api } from "@/lib/api";

export default async function OverviewPage() {
  const [netWorth, goals, run] = await Promise.all([
    api.getNetWorth(),
    api.listGoals(),
    api.runSimulation({ body: { persist: false } }),
  ]);

  return (
    <>
      <PageHeader title="Overview" tier="P0" prd="1, 4" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Net worth" value={formatUsd(netWorth.netWorthCents)} />
        <Stat label="Assets" value={formatUsd(netWorth.assetsCents)} />
        <Stat label="Liabilities" value={formatUsd(netWorth.liabilitiesCents)} />
      </div>
      <Card title="By account type" className="mt-4">
        <ul className="divide-y divide-line text-sm">
          {netWorth.byCategory.map((row) => (
            <li key={row.category} className="flex justify-between py-2">
              <span>{ACCOUNT_CATEGORY_LABEL[row.category]}</span>
              <span className="tabular-nums">{formatUsd(row.balanceCents)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
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
