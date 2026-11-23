import { DebtPayoffCard } from "../credit/DebtPayoffCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { AccountsClient } from "./AccountsClient";
import { LinkedBanks } from "./LinkedBanks";

export default async function AccountsPage() {
  const [accounts, netWorth, transactions, bankItems, payoff] = await Promise.all([
    api.listAccounts(),
    api.getNetWorth(),
    api.listTransactions({ query: { limit: 500 } }),
    api.listBankItems(),
    api.getDebtPayoff({ query: { extraCents: 0 } }).catch(() => null),
  ]);

  return <>
    <PageHeader title="Accounts" />
    <LinkedBanks initialItems={bankItems} />
    <AccountsClient accounts={accounts} netWorth={netWorth} transactions={transactions} />
    {payoff && payoff.debts.length > 0 && <div className="mt-6"><DebtPayoffCard initial={payoff} /></div>}
  </>;
}
