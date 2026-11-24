import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search = "" } = await searchParams;
  const [transactions, accounts, categories, unusual] = await Promise.all([
    // Hidden bank transactions come too, flagged `hidden`, for the Hidden tab. The client keeps them out of the main list and its totals.
    api.listTransactions({ query: { limit: 500, includeHidden: "true" } }),
    api.listAccounts(),
    api.listSpendingCategories(),
    api.listUnusualCharges().catch(() => []),
  ]);
  return <>
    <PageHeader title="Transactions" />
    <TransactionsClient transactions={transactions} accounts={accounts} categories={categories} initialQuery={search} unusual={Object.fromEntries(unusual.map((u) => [u.id, u]))} />
  </>;
}
