import { ACCOUNT_CATEGORY, ACCOUNT_CATEGORY_LABEL, formatUsd, isLiability } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

function AccountTypeIcon({ type }: { type: string }) {
  const map: Record<string, { emoji: string; bg: string; color: string }> = {
    checking:   { emoji: "🏦", bg: "#e8f4ff", color: "#2979ff" },
    savings:    { emoji: "💰", bg: "#d1fae5", color: "#10b981" },
    investment: { emoji: "📈", bg: "#ede9fe", color: "#8b5cf6" },
    loan:       { emoji: "📋", bg: "#fee2e2", color: "#ef4444" },
    credit:     { emoji: "💳", bg: "#fef3c7", color: "#f59e0b" },
  };
  const cfg = map[type] ?? { emoji: "🏛", bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
      style={{ background: cfg.bg }}
    >
      {cfg.emoji}
    </span>
  );
}

export default async function AccountsPage() {
  const accounts = await api.listAccounts();

  const assets = accounts.filter((a) => !isLiability(a.type));
  const liabilities = accounts.filter((a) => isLiability(a.type));

  function Section({ title, items }: { title: string; items: typeof accounts }) {
    if (items.length === 0) return null;
    return (
      <Card title={title}>
        <ul className="space-y-1">
          {items.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-inset"
            >
              <AccountTypeIcon type={account.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
                  {account.name}
                </p>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
                  {ACCOUNT_CATEGORY_LABEL[ACCOUNT_CATEGORY[account.type]]} · {account.institution}
                </p>
              </div>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: isLiability(account.type) ? "var(--critical)" : "var(--good)" }}
              >
                {isLiability(account.type) ? "−" : "+"}
                {formatUsd(account.balanceCents)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Accounts" />
      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Assets" items={assets} />
        <Section title="Liabilities" items={liabilities} />
      </div>
    </>
  );
}
