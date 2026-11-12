/**
 * Bank linking through Plaid (or the synthetic stand-in when no Plaid keys are set).
 *
 * Flow: the browser asks for a link token, opens Plaid Link, and sends the public token from
 * Link's onSuccess to /v1/bank/exchange. The API swaps it for an access token, stores that
 * encrypted, and runs the first sync. Later syncs (Refresh) continue from the saved cursor.
 * Access tokens never appear in a response.
 */
import type { Hono } from "hono";
import { routes, type BankItemSummary } from "@finvantage/contracts";
import { DEMO_USER_ID, NotImplementedError, PlaidApiError, type BankItemRecord } from "@finvantage/data";
import { GUEST_PREFIX } from "../auth";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

const summary = (item: BankItemRecord): BankItemSummary => ({
  itemId: item.itemId,
  institutionName: item.institutionName,
  status: item.status,
  accountCount: item.accountCount,
});

/**
 * The shared demo user is everyone's, so nobody may link a real or test bank to it. A guest is a
 * throwaway demo copy, not an account, so the same rule applies.
 */
function requireOwnAccount(userId: string) {
  if (userId === DEMO_USER_ID || userId.startsWith(GUEST_PREFIX)) {
    throw new HttpError(403, "sign_in_required", "Sign in to connect a bank.");
  }
}

/** Plaid failures become a readable 502, keeping Plaid's error code for the client. */
async function plaid<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof PlaidApiError) throw new HttpError(502, `plaid_${error.errorCode.toLowerCase()}`, error.message);
    if (error instanceof NotImplementedError) throw new HttpError(404, "not_available", error.message);
    throw error;
  }
}

/** Pulls the item's latest data from the bank and saves it. Returns its summary. */
export async function syncBankItem(deps: AppDeps, userId: string, itemId: string, accessToken: string) {
  const cursor = (await deps.ledger.listBankItems(userId)).find((i) => i.itemId === itemId)?.transactionsCursor ?? null;
  const update = await plaid(() => deps.bank.fetchItem(accessToken, cursor));
  await deps.ledger.applyBankUpdate(userId, update);
  deps.live.publish(userId, { type: "transaction.added", transactionId: update.added[0]?.transaction_id ?? itemId });
  const item = (await deps.ledger.listBankItems(userId)).find((i) => i.itemId === itemId);
  if (!item) throw new Error(`Bank item ${itemId} was not saved.`);
  return summary(item);
}

async function link(deps: AppDeps, userId: string, publicToken: string) {
  const { itemId, accessToken } = await plaid(() => deps.bank.exchangePublicToken(publicToken));
  await deps.bankTokens.save(userId, itemId, accessToken);
  return syncBankItem(deps, userId, itemId, accessToken);
}

export function registerBankRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.createBankLinkToken, async ({ userId }) => {
    requireOwnAccount(userId);
    return { linkToken: await plaid(() => deps.bank.createLinkToken(userId)) };
  });

  mount(app, deps, routes.exchangeBankToken, async ({ userId, body }) => {
    requireOwnAccount(userId);
    return link(deps, userId, body.publicToken);
  });

  mount(app, deps, routes.linkSandboxBank, async ({ userId }) => {
    requireOwnAccount(userId);
    if (!deps.bank.sandbox) throw new HttpError(404, "not_available", "Test banks exist only in Plaid Sandbox.");
    return link(deps, userId, await plaid(() => deps.bank.createSandboxPublicToken()));
  });

  mount(app, deps, routes.listBankItems, async ({ userId }) => (await deps.ledger.listBankItems(userId)).map(summary));

  mount(app, deps, routes.syncBankItem, async ({ userId, params }) => {
    const itemId = params.id ?? "";
    const accessToken = await deps.bankTokens.get(userId, itemId);
    if (!accessToken) throw new HttpError(404, "not_found", "No such linked bank.");
    return syncBankItem(deps, userId, itemId, accessToken);
  });

  mount(app, deps, routes.removeBankItem, async ({ userId, params }) => {
    const itemId = params.id ?? "";
    const accessToken = await deps.bankTokens.get(userId, itemId);
    if (!accessToken) throw new HttpError(404, "not_found", "No such linked bank.");
    // Tell Plaid first, so the access token stops working even if the local delete fails.
    await plaid(() => deps.bank.removeItem(accessToken));
    await deps.ledger.removeBankItem(userId, itemId);
    await deps.bankTokens.remove(userId, itemId);
    return { deleted: true as const };
  });
}
