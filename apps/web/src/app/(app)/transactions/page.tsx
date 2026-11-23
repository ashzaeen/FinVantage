import { PageHeader } from "@/components/ui/PageHeader";
import { SpendingPatternsCard } from "@/components/spending/SpendingPatternsCard";
import { api } from "@/lib/api";
import { TransactionsClient } from "./TransactionsClient";

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { search = "" } = await searchParams;
  const [transactions, accounts, categories, patterns, unusual] = await Promise.all([
    api.listTransactions({ query: { limit: 500 } }),
    api.listAccounts(),
    api.listSpendingCategories(),
    // A card, not the page: if this fails, the list still shows.
    api.getSpendingPatterns({ query: {} }).catch(() => null),
    api.listUnusualCharges().catch(() => []),
  ]);
  return <>
    <PageHeader title="Transactions" />
    <TransactionsClient transactions={transactions} accounts={accounts} categories={categories} initialQuery={search} unusual={Object.fromEntries(unusual.map((u) => [u.id, u]))} />
    {patterns && <div className="mt-6"><SpendingPatternsCard patterns={patterns} /></div>}
  </>;
}
