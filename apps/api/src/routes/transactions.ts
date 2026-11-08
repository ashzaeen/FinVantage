import type { Hono } from "hono";
import { routes, type NewTransaction, type Transaction } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";

const monthFromToday = (today: string) => today.slice(0, 7);

function monthKey(date: string) { return date.slice(0, 7); }
function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
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
    // STUB(transactions): run rule-based categorization here, then the LLM fallback.
    const normalized = await normalizeToUsd(body);
    const saved = await deps.ledger.addTransaction(normalized);
    deps.live.publish(userId, { type: "transaction.added", transactionId: saved.id });
    return saved;
  });

  mount(app, deps, routes.updateTransaction, async ({ userId, params, body }) => {
    const normalized = await normalizeToUsd(body);
    const updated = await deps.ledger.updateTransaction(userId, params.id, normalized);
    if (!updated) throw new HttpError(404, "not_found", "Transaction or account not found.");
    deps.live.publish(userId, { type: "transaction.added", transactionId: updated.id });
    return updated;
  });

  const getTransactions = (userId: string) => deps.ledger.listTransactions(userId, 2000);

  mount(app, deps, routes.listBudgets, async ({ userId }) => {
    const transactions = await getTransactions(userId);
    const month = monthFromToday(deps.today());
    const spent = new Map<string, number>();
    for (const transaction of transactions) {
      if (monthKey(transaction.date) === month && transaction.amountCents < 0 && transaction.category) {
        spent.set(transaction.category, (spent.get(transaction.category) ?? 0) + Math.abs(transaction.amountCents));
      }
    }
    // Limits are demo defaults; actual spend always comes from the user's ledger.
    const demoLimits: Record<string, number> = { groceries: 50_000, dining: 25_000, subscriptions: 10_000, housing: 200_000, utilities: 30_000, transport: 25_000, debt: 100_000 };
    return [...spent].map(([category, spentCents]) => ({ category, spentCents, limitCents: demoLimits[category] ?? Math.max(spentCents, 1) }));
  });

  const recurring = async ({ userId }: { userId: string }) => {
    const [transactions, accounts] = await Promise.all([getTransactions(userId), deps.ledger.listAccounts(userId)]);
    const latestByRecurring = new Map<string, (typeof transactions)[number]>();
    for (const transaction of transactions) {
      if (!transaction.isRecurring || transaction.amountCents >= 0) continue;
      const key = `${transaction.accountId}:${transaction.merchant.toLocaleLowerCase()}`;
      const previous = latestByRecurring.get(key);
      if (!previous || transaction.date > previous.date) latestByRecurring.set(key, transaction);
    }
    return [...latestByRecurring.values()].map((transaction) => ({
      merchant: transaction.merchant,
      amountCents: transaction.amountCents,
      cadence: "monthly" as const,
      nextDate: addDays(transaction.date, 30),
      accountId: accounts.find((account) => account.id === transaction.accountId)?.id ?? transaction.accountId,
    }));
  };
  mount(app, deps, routes.listRecurring, recurring);
  mount(app, deps, routes.listUpcomingBills, recurring);

  mount(app, deps, routes.getSpendingSummary, async ({ userId }) => {
    const transactions = await getTransactions(userId);
    const month = monthFromToday(deps.today());
    const previousDate = new Date(`${month}-01T00:00:00.000Z`);
    previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
    const previousMonth = previousDate.toISOString().slice(0, 7);
    const current = new Map<string, number>();
    const prior = new Map<string, number>();
    const trendKeys = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(`${month}-01T00:00:00.000Z`);
      date.setUTCMonth(date.getUTCMonth() - (5 - offset));
      return date.toISOString().slice(0, 7);
    });
    const monthlyTrend = new Map(trendKeys.map((key) => [key, { incomeCents: 0, spendingCents: 0 }]));
    for (const transaction of transactions) {
      const trend = monthlyTrend.get(monthKey(transaction.date));
      if (trend) {
        if (transaction.amountCents > 0) trend.incomeCents += transaction.amountCents;
        else trend.spendingCents += Math.abs(transaction.amountCents);
      }
      if (transaction.amountCents >= 0 || !transaction.category) continue;
      const key = monthKey(transaction.date);
      const target = key === month ? current : key === previousMonth ? prior : null;
      if (target) target.set(transaction.category, (target.get(transaction.category) ?? 0) + Math.abs(transaction.amountCents));
    }
    const categories = new Set([...current.keys(), ...prior.keys()]);
    return {
      month,
      monthlyTrend: trendKeys.map((key) => ({ month: key, ...monthlyTrend.get(key)! })),
      categories: [...categories].map((category) => {
        const spentCents = current.get(category) ?? 0;
        return { category, spentCents, changeVsPriorMonthCents: spentCents - (prior.get(category) ?? 0) };
      }).sort((a, b) => b.spentCents - a.spentCents),
    };
  });
}
