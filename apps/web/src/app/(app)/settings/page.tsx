import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { SettingsClient } from "./SettingsClient";
import { ManageTools } from "../spending/ManageTools";

export default async function SettingsPage() {
  const [user, categories, rules, transactions] = await Promise.all([
    api.getMe(),
    api.listSpendingCategories(),
    api.listCategoryRules(),
    api.listTransactions({ query: { limit: 25 } }),
  ]);
  const recentSpending = transactions.filter((t) => t.amountCents < 0).slice(0, 12);

  return (
    <>
      <PageHeader title="Settings" tier="P0" prd="9" />
      <div className="space-y-4">
        <Card title="Spending Organization">
          <p className="mb-3 text-sm text-muted">
            Create your own categories and set rules that sort matching purchases automatically.
          </p>
          <ManageTools categories={categories} rules={rules} transactions={recentSpending} />
        </Card>
        <SettingsClient user={user} />
      </div>
    </>
  );
}
