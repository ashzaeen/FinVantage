import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { liabilityBills, recurringChargesFor } from "../spending/recurring";
import { buildSubscriptions, overviewOf } from "../spending/subscriptions";

export function registerSubscriptionRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const load = async (userId: string) => {
    const [charges, accounts, transactions, income] = await Promise.all([
      recurringChargesFor(deps, userId),
      deps.ledger.listAccounts(userId),
      deps.ledger.listTransactions(userId, 5000),
      deps.ledger.getIncomeProfile(userId),
    ]);
    const monthlyIncomeCents = income?.monthlyIncomeCents ?? null;
    return {
      monthlyIncomeCents,
      details: buildSubscriptions({
        charges,
        loans: liabilityBills(accounts),
        transactions,
        monthlyIncomeCents,
        today: deps.today(),
      }),
    };
  };

  mount(app, deps, routes.listSubscriptions, async ({ userId }) => {
    const { details, monthlyIncomeCents } = await load(userId);
    return overviewOf(details, monthlyIncomeCents);
  });

  mount(app, deps, routes.getSubscription, async ({ userId, params }) => {
    const found = (await load(userId)).details.find((d) => d.id === params.id);
    if (!found) throw new HttpError(404, "not_found", "That subscription does not exist.");
    return found;
  });
}
