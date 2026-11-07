import type { Hono } from "hono";
import { ACCOUNT_CATEGORY, AccountCategory, isLiability, routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

export function registerAccountRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listAccounts, ({ userId }) => deps.ledger.listAccounts(userId));

  mount(app, deps, routes.getNetWorth, async ({ userId }) => {
    const accounts = await deps.ledger.listAccounts(userId);
    const sum = (filter: (liability: boolean) => boolean) =>
      accounts
        .filter((a) => filter(isLiability(a.type)))
        .reduce((total, a) => total + a.balanceCents, 0);
    const assetsCents = sum((liability) => !liability);
    const liabilitiesCents = sum((liability) => liability);
    const netWorthCents = assetsCents - liabilitiesCents;

    // STUB(transactions): a flat line ending today. Replace with real history from the ledger.
    const today = new Date(`${deps.today()}T00:00:00Z`);
    const history = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(today);
      date.setUTCMonth(date.getUTCMonth() - (11 - i));
      return { date: date.toISOString().slice(0, 10), netWorthCents };
    });

    return {
      assetsCents,
      liabilitiesCents,
      netWorthCents,
      byCategory: AccountCategory.options.map((category) => ({
        category,
        balanceCents: accounts
          .filter((a) => ACCOUNT_CATEGORY[a.type] === category)
          .reduce((total, a) => total + a.balanceCents, 0),
      })),
      history,
    };
  });
}
