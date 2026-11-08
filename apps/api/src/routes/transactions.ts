import type { Hono } from "hono";
import { assignCategory, routes, topCategoryId, type NewTransaction, type Transaction } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { buildCatalog, ruleCategoryFor } from "../spending/catalog";

/** Drops a subcategory that does not sit under the transaction's category. */
function withValidSubcategory<T extends Pick<Transaction, "category" | "subcategory">>(transaction: T): T {
  const fits = transaction.subcategory && transaction.category && topCategoryId(transaction.subcategory) === transaction.category;
  return fits ? transaction : { ...transaction, subcategory: null };
}

async function normalizeToUsd(transaction: NewTransaction & Pick<Transaction, "category" | "isRecurring">): Promise<Omit<Transaction, "id">> {
  const originalAmountCents = transaction.amountCents;
  if (transaction.currency === "USD") {
    return { ...transaction, originalAmountCents, exchangeRateToUsd: 1, exchangeRateDate: transaction.date };
  }
  let response: Response;
  try {
    response = await fetch(`https://api.frankfurter.dev/v2/rate/${transaction.currency.toLowerCase()}/usd?date=${transaction.date}`);
  } catch {
    throw new HttpError(500, "exchange_rate_unavailable", "Could not reach the exchange-rate service. Try again later or choose USD.");
  }
  if (!response.ok) throw new HttpError(500, "exchange_rate_unavailable", "Could not load an exchange rate for this transaction date. Try again later or choose USD.");
  const quote = await response.json() as { rate?: number; date?: string };
  if (typeof quote.rate !== "number" || !Number.isFinite(quote.rate) || !quote.date) throw new HttpError(500, "exchange_rate_unavailable", "The exchange-rate service returned an invalid rate.");
  const rate = quote.rate;
  return {
    ...transaction,
    amountCents: Math.round(originalAmountCents * rate),
    originalAmountCents,
    exchangeRateToUsd: rate,
    exchangeRateDate: quote.date,
  };
}

export function registerTransactionRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.listTransactions, ({ userId, query }) =>
    deps.ledger.listTransactions(userId, query.limit),
  );

  mount(app, deps, routes.addTransaction, async ({ userId, body }) => {
    // STUB(transactions): the LLM fallback for merchants with no category and no rule.
    const ruled = body.category ? null : ruleCategoryFor((await deps.spending.get(userId)).rules, body.merchant);
    const normalized = withValidSubcategory(await normalizeToUsd(ruled ? { ...body, ...assignCategory(ruled) } : body));
    const saved = await deps.ledger.addTransaction(normalized);
    deps.live.publish(userId, { type: "transaction.added", transactionId: saved.id });
    return saved;
  });

  mount(app, deps, routes.updateTransaction, async ({ userId, params, body }) => {
    const normalized = withValidSubcategory(await normalizeToUsd(body));
    const updated = await deps.ledger.updateTransaction(userId, params.id, normalized);
    if (!updated) throw new HttpError(404, "not_found", "Transaction or account not found.");
    deps.live.publish(userId, { type: "transaction.added", transactionId: updated.id });
    return updated;
  });

  /** Moves a transaction to any category the user has, including their own subcategories. */
  mount(app, deps, routes.recategorizeTransaction, async ({ userId, params, body }) => {
    const transaction = (await deps.ledger.listTransactions(userId, 5000)).find((t) => t.id === params.id);
    if (!transaction) throw new HttpError(404, "not_found", "Transaction not found.");
    if (body.categoryId) {
      const catalog = buildCatalog(await deps.spending.get(userId));
      if (!catalog.byId.has(body.categoryId)) throw new HttpError(404, "not_found", "That category does not exist.");
    }
    const { id, ...rest } = transaction;
    const updated = await deps.ledger.updateTransaction(userId, id, { ...rest, ...assignCategory(body.categoryId) });
    if (!updated) throw new HttpError(404, "not_found", "Transaction not found.");
    deps.live.publish(userId, { type: "transaction.added", transactionId: updated.id });
    return updated;
  });
}
