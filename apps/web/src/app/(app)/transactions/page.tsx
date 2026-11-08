import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage() {
  const [transactions, accounts] = await Promise.all([
    api.listTransactions({ query: { limit: 500 } }),
    api.listAccounts(),
  ]);
  return <>
    <PageHeader title="Transactions" />
    <TransactionsClient transactions={transactions} accounts={accounts} />
  </>;
}
