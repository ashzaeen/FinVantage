import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { AccountsClient } from "./AccountsClient";
import { LinkedBanks } from "./LinkedBanks";

export default async function AccountsPage() {
  const [accounts, netWorth, transactions, bankItems] = await Promise.all([
    api.listAccounts(),
    api.getNetWorth(),
    api.listTransactions({ query: { limit: 500 } }),
    api.listBankItems(),
  ]);

  return <>
    <PageHeader title="Accounts" />
    <LinkedBanks initialItems={bankItems} />
    <AccountsClient accounts={accounts} netWorth={netWorth} transactions={transactions} />
  </>;
}
