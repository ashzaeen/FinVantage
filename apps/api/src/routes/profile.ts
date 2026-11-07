import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

export function registerProfileRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.getMe, async ({ userId }) => {
    const user = await deps.ledger.getUser(userId);
    if (!user) throw new HttpError(404, "not_found", "User not found.");
    return user;
  });

  mount(app, deps, routes.updateExtensionSettings, async ({ userId, body }) => {
    const user = await deps.ledger.getUser(userId);
    if (!user) throw new HttpError(404, "not_found", "User not found.");
    return deps.ledger.saveUser({ ...user, extensionSettings: body });
  });

  mount(app, deps, routes.loadDemoProfile, async ({ userId }) => {
    await deps.ledger.loadDemoProfile(userId);
    return { accounts: (await deps.ledger.listAccounts(userId)).length };
  });
}
