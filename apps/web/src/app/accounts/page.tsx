import { ACCOUNT_CATEGORY, ACCOUNT_CATEGORY_LABEL, formatUsd, isLiability } from "@finvantage/contracts";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";

export default async function AccountsPage() {
  const accounts = await api.listAccounts();

  return (
    <>
      <PageHeader title="Accounts" tier="P0" prd="4 (#1, #4)" />
      <Card>
        <ul className="divide-y divide-line text-sm">
          {accounts.map((account) => (
            <li key={account.id} className="flex justify-between gap-4 py-2">
              <span>
                {account.name}
                <span className="block text-xs text-muted">
                  {ACCOUNT_CATEGORY_LABEL[ACCOUNT_CATEGORY[account.type]]} · {account.institution}
                </span>
              </span>
              <span className="tabular-nums">
                {isLiability(account.type) ? "-" : ""}
                {formatUsd(account.balanceCents)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
