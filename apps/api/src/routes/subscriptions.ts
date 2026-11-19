import type { Hono } from "hono";
import { RecurringCharge, formatUsd, routes, type Subscription } from "@finvantage/contracts";
import { buildCancellationGuide } from "@finvantage/data";
import { formatLongDate, generateSubscriptionDraft, type SubscriptionDraftInput } from "@finvantage/llm";
import { billingChannel, normalizeMerchant } from "@finvantage/math-core";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { loadSubscriptions, overviewOf } from "../spending/subscriptions";

/** How a charge's schedule reads in a sentence: "I currently pay $15.49 a month". */
const CADENCE_PHRASE: Record<Subscription["cadence"], string> = {
  weekly: "a week",
  biweekly: "every two weeks",
  semi_monthly: "twice a month",
  monthly: "a month",
  yearly: "a year",
  unknown: "each billing period",
};

export function registerSubscriptionRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const load = (userId: string) => loadSubscriptions(deps, userId);

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

  /** Steps for the user to follow. Nothing is cancelled and no model is called. */
  mount(app, deps, routes.getSubscriptionGuide, async ({ userId, params }) => {
    const found = (await load(userId)).details.find((d) => d.id === params.id);
    if (!found) throw new HttpError(404, "not_found", "That subscription does not exist.");
    return buildCancellationGuide({
      channel: billingChannel(found.merchant),
      normalizedMerchant: normalizeMerchant(found.merchant),
      displayName: found.merchant,
    });
  });

  /**
   * A message for the user to read and send themselves; nothing is sent. Each kind needs figures on
   * record, so a message never cites a price rise or a late charge that did not happen. The model
   * only words it: the figures are formatted here and checked afterwards, and a failure gives the
   * standard template.
   */
  mount(app, deps, routes.draftSubscriptionMessage, async ({ userId, params, body }) => {
    const found = (await load(userId)).details.find((d) => d.id === params.id);
    if (!found) throw new HttpError(404, "not_found", "That subscription does not exist.");

    const input: SubscriptionDraftInput = {
      action: body.action,
      merchant: found.merchant.slice(0, 100),
      amount: formatUsd(Math.abs(found.amountCents)),
      cadence: CADENCE_PHRASE[found.cadence],
      previousAmount: null,
      changedOn: null,
      cancelledOn: null,
      chargedOn: null,
      chargedAmount: null,
    };

    if (body.action === "cancel") {
      if (found.status === "cancelled") throw new HttpError(400, "invalid_request", "That subscription is already marked cancelled.");
    } else if (body.action === "lower_bill") {
      const rise = found.flags.find((f) => f.type === "price_up");
      if (!rise || rise.previousCents === null || !rise.changedOn) {
        throw new HttpError(400, "invalid_request", "There is no price rise on record for this charge.");
      }
      input.previousAmount = formatUsd(rise.previousCents);
      input.changedOn = formatLongDate(rise.changedOn);
    } else {
      const again = found.flags.find((f) => f.type === "still_charging");
      if (found.status !== "cancelled" || !found.cancelledOn || !again?.changedOn) {
        throw new HttpError(400, "invalid_request", "There is no charge after a cancellation on record.");
      }
      const charge = found.history.find((h) => h.date === again.changedOn);
      input.cancelledOn = formatLongDate(found.cancelledOn);
      input.chargedOn = formatLongDate(again.changedOn);
      input.chargedAmount = formatUsd(Math.abs(charge?.amountCents ?? found.amountCents));
    }

    const draft = await generateSubscriptionDraft(deps.llm, input);
    return { action: body.action, ...draft };
  });
}
