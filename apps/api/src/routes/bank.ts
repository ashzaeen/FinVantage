import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

export function registerBankRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.createBankLinkToken, async ({ userId }) => ({
    linkToken: await deps.bank.createLinkToken(userId),
  }));

  mount(app, deps, routes.exchangeBankToken, async ({ userId, body }) => {
    const accounts = await deps.bank.exchangePublicToken(userId, body.publicToken);
    await deps.ledger.replaceAccounts(userId, accounts);
    return { accounts };
  });
}
