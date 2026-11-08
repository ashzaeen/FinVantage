import { formatUsd } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

function MerchantAvatar({ name }: { name: string }) {
  const colors = [
    ["#fee2e2", "#ef4444"], ["#fef3c7", "#f59e0b"],
    ["#d1fae5", "#10b981"], ["#dbeafe", "#3b82f6"], ["#ede9fe", "#8b5cf6"],
  ];
  const idx = name.charCodeAt(0) % colors.length;
  const [bg, fg] = colors[idx]!;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{ background: bg, color: fg }}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function StatusBadge({ positive }: { positive: boolean }) {
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: positive ? "var(--good-bg)" : "var(--critical-bg)", color: positive ? "var(--good)" : "var(--critical)" }}>
      {positive ? "Income" : "Expense"}
    </span>
  );
}

export default async function TransactionsPage() {
  const transactions = await api.listTransactions();

  return (
    <>
      <PageHeader title="Transactions" showSearch />
      <Card noPad>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--ink-muted)", borderBottom: "1px solid var(--border)" }}>
          <span>Name</span>
          <span>Date</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Type</span>
        </div>
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {transactions.map((tx) => (
            <li key={tx.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-inset">
              <span className="flex items-center gap-3 min-w-0">
                <MerchantAvatar name={tx.merchant} />
                <span>
                  <span className="block font-medium truncate" style={{ color: "var(--ink)" }}>{tx.merchant}</span>
                  <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
                    {tx.category ?? "Uncategorized"}{tx.isRecurring ? " · Recurring" : ""}
                  </span>
                </span>
              </span>
              <span className="text-xs whitespace-nowrap" style={{ color: "var(--ink-muted)" }}>{tx.date}</span>
              <span className="tabular-nums font-semibold text-right"
                style={{ color: tx.amountCents < 0 ? "var(--critical)" : "var(--good)" }}>
                {formatUsd(tx.amountCents)}
              </span>
              <span className="flex justify-end">
                <StatusBadge positive={tx.amountCents >= 0} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
