import type { Hono } from "hono";
import { ACCOUNT_CATEGORY, AccountCategory, isLiability, routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

export function registerAccountRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listAccounts, ({ userId }) => deps.ledger.listAccounts(userId));

  mount(app, deps, routes.createAccount, ({ userId, body }) => deps.ledger.createAccount(userId, body));

  mount(app, deps, routes.updateAccount, async ({ userId, params, body }) => {
    const account = await deps.ledger.updateAccount(userId, params.id, body);
    if (!account) throw new HttpError(404, "not_found", "Account not found.");
    return account;
  });

  mount(app, deps, routes.getNetWorth, async ({ userId }) => {
    const accounts = await deps.ledger.listAccounts(userId);
    const sum = (filter: (liability: boolean) => boolean) =>
      accounts
        .filter((a) => filter(isLiability(a.type)))
        .reduce((total, a) => total + a.balanceCents, 0);
    const assetsCents = sum((liability) => !liability);
    const liabilitiesCents = sum((liability) => liability);
    const netWorthCents = assetsCents - liabilitiesCents;

    const transactions = await deps.ledger.listTransactions(userId, 2000);
    const todayIso = deps.today();
    const currentMonth = new Date(`${todayIso}T00:00:00Z`);
    currentMonth.setUTCDate(1);
    const history = Array.from({ length: 12 }, (_, i) => {
      const monthStart = new Date(currentMonth);
      monthStart.setUTCMonth(monthStart.getUTCMonth() - (11 - i));
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
      const date = monthEnd.toISOString().slice(0, 10) > todayIso ? todayIso : monthEnd.toISOString().slice(0, 10);
      const activityAfterDate = transactions
        .filter((transaction) => transaction.date > date && transaction.date <= todayIso)
        .reduce((total, transaction) => total + transaction.amountCents, 0);
      return { date, netWorthCents: netWorthCents - activityAfterDate };
    });

    return {
      assetsCents,
      liabilitiesCents,
      netWorthCents,
      byCategory: AccountCategory.options.map((category) => ({
        category,
        balanceCents: accounts
          .filter((a) => ACCOUNT_CATEGORY[a.type] === category)
          .reduce((total, a) => total + (isLiability(a.type) ? -a.balanceCents : a.balanceCents), 0),
      })),
      history,
    };
  });
}
