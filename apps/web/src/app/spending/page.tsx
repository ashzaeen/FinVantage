import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function SpendingPage() {
  const [budgets, bills, recurring, summary] = await Promise.all([
    api.listBudgets(),
    api.listUpcomingBills(),
    api.listRecurring(),
    api.getSpendingSummary(),
  ]);

  return (
    <>
      <PageHeader title="Spending" tier="P1" prd="4 (#3, #5, #7, #10)" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Budgets">
          <ul className="space-y-3 text-sm">
            {budgets.map((budget) => {
              const over = budget.spentCents > budget.limitCents;
              const width = Math.min(100, (budget.spentCents / budget.limitCents) * 100);
              return (
                <li key={budget.category}>
                  <span className="flex justify-between">
                    {budget.category}
                    <span className={over ? "text-critical" : "text-muted"}>
                      {formatUsd(budget.spentCents)} of {formatUsd(budget.limitCents)}
                      {over ? " · Over" : ""}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 rounded bg-line">
                    <span
                      className={`block h-1.5 rounded ${over ? "bg-critical" : "bg-accent"}`}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={`Summary for ${summary.month}`}>
          <ul className="text-sm">
            {summary.categories.map((row) => (
              <li key={row.category} className="flex justify-between py-1">
                {row.category}
                <span className="tabular-nums">
                  {formatUsd(row.spentCents)} ({formatUsd(row.changeVsPriorMonthCents)})
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Upcoming bills">
          <ul className="text-sm">
            {bills.map((bill) => (
              <li key={bill.merchant} className="flex justify-between py-1">
                {bill.merchant}
                <span className="text-muted">{bill.nextDate}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recurring charges">
          <ul className="text-sm">
            {recurring.map((charge) => (
              <li key={charge.merchant} className="flex justify-between py-1">
                {charge.merchant}
                <span className="text-muted">
                  {formatUsd(charge.amountCents)} · {charge.cadence}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
