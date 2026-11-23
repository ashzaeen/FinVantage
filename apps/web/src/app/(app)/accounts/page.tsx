import { CashRunway } from "./CashRunway";
import { DebtPayoffCard } from "./DebtPayoffCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { AccountsClient } from "./AccountsClient";
import { LinkedBanks } from "./LinkedBanks";

export default async function AccountsPage() {
  const [accounts, netWorth, transactions, bankItems, payoff, insights] = await Promise.all([
    api.listAccounts(),
    api.getNetWorth(),
    api.listTransactions({ query: { limit: 500 } }),
    api.listBankItems(),
    api.getDebtPayoff({ query: { extraCents: 0 } }).catch(() => null),
    api.getOverviewInsights().catch(() => null),
  ]);

  return <>
    <PageHeader title="Accounts" />
    <LinkedBanks initialItems={bankItems} />
    <AccountsClient accounts={accounts} netWorth={netWorth} transactions={transactions} />
    <div className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      {insights && <CashRunway insights={insights} />}
      {payoff && payoff.debts.length > 0 && <DebtPayoffCard initial={payoff} />}
    </div>
  </>;
}
