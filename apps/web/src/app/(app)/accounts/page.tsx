import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { AccountsClient } from "./AccountsClient";

export default async function AccountsPage() {
  const [accounts, netWorth, transactions] = await Promise.all([
    api.listAccounts(),
    api.getNetWorth(),
    api.listTransactions({ query: { limit: 500 } }),
  ]);

  return <>
    <PageHeader title="Accounts" />
    <AccountsClient accounts={accounts} netWorth={netWorth} transactions={transactions} />
  </>;
}
