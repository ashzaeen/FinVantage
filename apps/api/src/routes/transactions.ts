import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

const monthFromToday = (today: string) => today.slice(0, 7);

export function registerTransactionRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listTransactions, ({ userId, query }) =>
    deps.ledger.listTransactions(userId, query.limit),
  );

  mount(app, deps, routes.addTransaction, async ({ userId, body }) => {
    // STUB(transactions): run rule-based categorization here, then the LLM fallback.
    const saved = await deps.ledger.addTransaction(body);
    deps.live.publish(userId, { type: "transaction.added", transactionId: saved.id });
    return saved;
  });

  // STUB(transactions): the routes below are canned. Compute them from the ledger.
  mount(app, deps, routes.listBudgets, async () => [
    { category: "groceries", limitCents: 50_000, spentCents: 8_742 },
    { category: "dining", limitCents: 25_000, spentCents: 3_210 },
    { category: "subscriptions", limitCents: 2_000, spentCents: 2_598 },
  ]);

  const recurring = async () => [
    {
      merchant: "StreamFlix",
      amountCents: -1_599,
      cadence: "monthly" as const,
      nextDate: "2026-12-02",
      accountId: "acc_card",
    },
    {
      merchant: "City Power",
      amountCents: -12_300,
      cadence: "monthly" as const,
      nextDate: "2026-12-05",
      accountId: "acc_checking",
    },
  ];
  mount(app, deps, routes.listRecurring, recurring);
  mount(app, deps, routes.listUpcomingBills, recurring);

  mount(app, deps, routes.getSpendingSummary, async () => ({
    month: monthFromToday(deps.today()),
    categories: [
      { category: "groceries", spentCents: 8_742, changeVsPriorMonthCents: -1_200 },
      { category: "dining", spentCents: 3_210, changeVsPriorMonthCents: 450 },
    ],
  }));
}
