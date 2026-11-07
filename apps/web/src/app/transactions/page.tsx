import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function TransactionsPage() {
  const transactions = await api.listTransactions();

  return (
    <>
      <PageHeader title="Transactions" tier="P1" prd="4 (#2)" />
      <Card>
        <ul className="divide-y divide-line text-sm">
          {transactions.map((t) => (
            <li key={t.id} className="flex justify-between gap-4 py-2">
              <span>
                {t.merchant}
                <span className="block text-xs text-muted">
                  {t.date} · {t.category ?? "Uncategorized"}
                  {t.isRecurring ? " · Recurring" : ""}
                </span>
              </span>
              <span className="tabular-nums">{formatUsd(t.amountCents)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
