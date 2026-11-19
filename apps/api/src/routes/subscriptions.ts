import type { Hono } from "hono";
import { RecurringCharge, routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { liabilityBills, recurringChargesFor } from "../spending/recurring";
import { buildSubscriptions, overviewOf } from "../spending/subscriptions";

export function registerSubscriptionRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const load = async (userId: string) => {
    const [charges, accounts, transactions, income, states] = await Promise.all([
      recurringChargesFor(deps, userId),
      deps.ledger.listAccounts(userId),
      deps.ledger.listTransactions(userId, 5000),
      deps.ledger.getIncomeProfile(userId),
      deps.subscriptions.list(userId),
    ]);
    const monthlyIncomeCents = income?.monthlyIncomeCents ?? null;
    return {
      monthlyIncomeCents,
      states,
      details: buildSubscriptions({
        charges,
        loans: liabilityBills(accounts),
        transactions,
        monthlyIncomeCents,
        today: deps.today(),
        states,
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

  /**
   * Records what the user says about a subscription. It never contacts the provider: a "cancelled"
   * status means the user says they cancelled, and the next charges show whether that held.
   */
  mount(app, deps, routes.updateSubscription, async ({ userId, params, body }) => {
    const { details, states } = await load(userId);
    const current = details.find((d) => d.id === params.id);
    if (!current) throw new HttpError(404, "not_found", "That subscription does not exist.");

    const today = deps.today();
    const status = body.status ?? current.status;
    if (body.cancelledOn !== undefined && status !== "cancelled") {
      throw new HttpError(400, "invalid_request", "A cancellation date only goes with the cancelled status.");
    }
    if (body.cancelledOn !== undefined && body.cancelledOn > today) {
      throw new HttpError(400, "invalid_request", "The cancellation date cannot be in the future.");
    }

    const existing = states.find((s) => s.id === current.id);
    await deps.subscriptions.save(userId, {
      id: current.id,
      // What the bank showed now, so the subscription stays listed after its stream ends.
      charge: RecurringCharge.parse({
        merchant: current.merchant,
        amountCents: current.amountCents,
        cadence: current.cadence,
        nextDate: current.nextDate,
        accountId: current.accountId,
        category: current.category,
        source: current.source,
      }),
      status,
      kind: body.kind === undefined ? (existing?.kind ?? null) : body.kind,
      cancelledOn: status === "cancelled" ? (body.cancelledOn ?? current.cancelledOn ?? today) : null,
      updatedAt: deps.now(),
    });

    const updated = (await load(userId)).details.find((d) => d.id === current.id);
    return updated ?? current;
  });
}
