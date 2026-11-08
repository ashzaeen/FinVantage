import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { latestCompletedQuarter, previousQuarter, quarterWindow } from "../reporting/quarterly-report";
import { runSimulation } from "../services";

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
    // The demo replaces the user's money, not who they are: keep their own name and email.
    const before = await deps.ledger.getUser(userId);
    await deps.ledger.loadDemoProfile(userId);
    const after = await deps.ledger.getUser(userId);
    if (before && after) {
      await deps.ledger.saveUser({ ...after, displayName: before.displayName, email: before.email });
    }
    if ((await deps.docs.listSimulationRuns(userId)).length === 0) {
      const latest = latestCompletedQuarter(deps.today());
      const quarters = [previousQuarter(previousQuarter(latest)), previousQuarter(latest), latest];
      let previousRunId: string | null = null;
      for (const [index, quarter] of quarters.entries()) {
        const preview = await runSimulation(deps, userId, {
          persist: false,
          seed: 2026,
          whatIf: {
            monthlySavingsDeltaCents: index * 25_000,
            purchaseAmountCents: 0,
            eventShifts: [],
          },
        });
        const id = randomUUID();
        await deps.docs.saveSimulationRun({
          ...preview,
          id,
          createdAt: `${quarterWindow(quarter).start.slice(0, 8)}15T12:00:00.000Z`,
          previousRunId,
          persisted: true,
        });
        previousRunId = id;
      }
    }
    return { accounts: (await deps.ledger.listAccounts(userId)).length };
  });
}
