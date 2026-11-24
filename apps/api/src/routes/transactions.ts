import type { Hono } from "hono";
import { assignCategory, routes, UNKNOWN_CATEGORY_ID, topCategoryId, type NewTransaction, type Transaction } from "@finvantage/contracts";
import { transactionSummary } from "@finvantage/math-core";
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
  // Totals for exactly the rows the page is showing, by id, so a filter in the browser and the
  // figures beside it can never disagree. Reads only.
  mount(app, deps, routes.summarizeTransactions, async ({ userId, body }) => {
    const wanted = new Set(body.ids);
    const all = await deps.ledger.listTransactions(userId, 5000);
    return transactionSummary(all.filter((t) => wanted.has(t.id)), deps.today());
  });

  mount(app, deps, routes.listTransactions, ({ userId, query }) =>
    deps.ledger.listTransactions(userId, query.limit, { includeHidden: query.includeHidden }),
  );

  // Deleting a transaction the user entered removes it. A synced bank transaction is hidden instead:
  // it leaves lists and totals, survives bank syncs, and can be restored.
  mount(app, deps, routes.removeTransaction, async ({ userId, params }) => {
    const result = await deps.ledger.removeTransaction(userId, params.id ?? "");
    if (result === "not_found") throw new HttpError(404, "not_found", "Transaction not found.");
    deps.live.publish(userId, { type: "transaction.added", transactionId: params.id ?? "" });
    return { result };
  });

  mount(app, deps, routes.restoreTransaction, async ({ userId, params }) => {
    const restored = await deps.ledger.restoreTransaction(userId, params.id ?? "");
    if (!restored) throw new HttpError(404, "not_found", "There is no hidden transaction with that id.");
    deps.live.publish(userId, { type: "transaction.added", transactionId: restored.id });
    return restored;
  });

  mount(app, deps, routes.addTransaction, async ({ userId, body }) => {
    // STUB(transactions): the LLM fallback for merchants with no category and no rule. Until then they are Unknown.
    const ruled = body.category ? null : ruleCategoryFor((await deps.spending.get(userId)).rules, body.merchant);
    const categorized = body.category ? body : { ...body, ...assignCategory(ruled ?? UNKNOWN_CATEGORY_ID) };
    const normalized = withValidSubcategory(await normalizeToUsd(categorized));
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

  mount(app, deps, routes.bulkRecategorizeTransactions, async ({ userId, body }) => {
    const wanted = new Set(body.ids);
    const found = (await deps.ledger.listTransactions(userId, 5000)).filter((t) => wanted.has(t.id));
    // Nothing is changed unless every id is the user's and the category exists.
    if (found.length !== wanted.size) throw new HttpError(404, "not_found", "One of those transactions was not found.");
    if (body.categoryId && !buildCatalog(await deps.spending.get(userId)).byId.has(body.categoryId)) throw new HttpError(404, "not_found", "That category does not exist.");
    for (const { id, ...rest } of found) {
      await deps.ledger.updateTransaction(userId, id, { ...rest, ...assignCategory(body.categoryId) });
      deps.live.publish(userId, { type: "transaction.added", transactionId: id });
    }
    return { updated: found.length };
  });

  mount(app, deps, routes.splitTransaction, async ({ userId, params, body }) => {
    const original = (await deps.ledger.listTransactions(userId, 5000)).find((t) => t.id === params.id);
    if (!original) throw new HttpError(404, "not_found", "Transaction not found.");
    if (original.currency !== "USD") throw new HttpError(400, "unsupported", "Only US dollar transactions can be split.");
    const total = body.parts.reduce((sum, p) => sum + p.amountCents, 0);
    if (total !== original.amountCents) throw new HttpError(400, "parts_do_not_add_up", "The parts must add up to the original amount.");
    const sign = Math.sign(original.amountCents);
    if (body.parts.some((p) => p.amountCents === 0 || Math.sign(p.amountCents) !== sign)) throw new HttpError(400, "bad_part", "Every part must be above zero, on the same side as the original.");
    const catalog = buildCatalog(await deps.spending.get(userId));
    if (body.parts.some((p) => p.categoryId && !catalog.byId.has(p.categoryId))) throw new HttpError(404, "not_found", "That category does not exist.");
    const { id, ...rest } = original;
    const fields = (part: (typeof body.parts)[number]) => ({ ...rest, amountCents: part.amountCents, originalAmountCents: part.amountCents, ...assignCategory(part.categoryId) });
    const [first, ...others] = body.parts;
    const saved: Transaction[] = [];
    const kept = await deps.ledger.updateTransaction(userId, id, fields(first!));
    if (!kept) throw new HttpError(404, "not_found", "Transaction not found.");
    saved.push(kept);
    for (const part of others) saved.push(await deps.ledger.addTransaction(fields(part)));
    deps.live.publish(userId, { type: "transaction.added", transactionId: id });
    return saved;
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
