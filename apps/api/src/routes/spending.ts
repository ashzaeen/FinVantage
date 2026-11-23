import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  MAX_CATEGORY_DEPTH,
  assignCategory,
  canonicalCategoryId,
  categoryDepth,
  parentCategoryId,
  routes,
  topCategoryId,
  type Budget,
  type BudgetedBucket,
  type Transaction,
} from "@finvantage/contracts";
import { liquidCashCents, overviewInsights, spendingPatterns } from "@finvantage/math-core";
import type { SpendingProfile } from "@finvantage/data";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { addDays, liabilityBills, recurringChargesFor, withoutCoveredStreams } from "../spending/recurring";
import { buildCatalog, bucketOf, categoryIdOf, countsToward, isSpending, ruleCategoryFor, type Catalog } from "../spending/catalog";

const BILL_WINDOW_DAYS = 14;
const SUGGESTION_MONTHS = 3;

const monthKey = (date: string) => date.slice(0, 7);

function shiftMonth(month: string, by: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The middle value: one unusually big month cannot drag it the way it drags an average. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Spent so far, where the month is heading, and a suggested limit from recent months. */
function budgetRow(
  category: string,
  limitCents: number,
  transactions: Transaction[],
  catalog: Catalog,
  today: string,
): Budget {
  const month = monthKey(today);
  const recent = new Set(Array.from({ length: SUGGESTION_MONTHS }, (_, i) => shiftMonth(month, -(i + 1))));
  let spentCents = 0;
  const recentByMonth = new Map<string, number>([...recent].map((key) => [key, 0]));
  let recentSeen = false;
  for (const t of transactions) {
    if (!isSpending(catalog, t) || !countsToward(category, t)) continue;
    const key = monthKey(t.date);
    if (key === month) spentCents += Math.abs(t.amountCents);
    else if (recent.has(key)) {
      recentByMonth.set(key, (recentByMonth.get(key) ?? 0) + Math.abs(t.amountCents));
      recentSeen = true;
    }
  }
  const day = Number(today.slice(8, 10));
  const projectedCents = Math.round((spentCents / day) * daysInMonth(month));
  return {
    category,
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    projectedCents,
    status: spentCents > limitCents ? "over" : projectedCents > limitCents ? "at_risk" : "on_track",
    suggestedLimitCents: recentSeen ? Math.round(median([...recentByMonth.values()])) : null,
  };
}

/**
 * What the spending and planning routes share: the user's spending profile and category catalog,
 * their transactions, and the six-month summary built from them.
 */
export function spendingContext(deps: AppDeps) {
  const transactionsOf = (userId: string) => deps.ledger.listTransactions(userId, 5000);
  const load = async (userId: string) => {
    const profile = await deps.spending.get(userId);
    return { profile, catalog: buildCatalog(profile) };
  };

  /** Six months of income, spending and saving, this month's categories, and each category's six-month line. */
  const summaryFor = async (userId: string) => {
    const [{ catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const month = monthKey(deps.today());
    const previousMonth = shiftMonth(month, -1);
    const current = new Map<string, number>();
    const prior = new Map<string, number>();
    const trendKeys = Array.from({ length: 6 }, (_, offset) => shiftMonth(month, offset - 5));
    const monthlyTrend = new Map(trendKeys.map((key) => [key, { incomeCents: 0, spendingCents: 0, savedCents: 0 }]));
    const byCategory = new Map<string, Map<string, number>>();
    for (const t of transactions) {
      // Income is money in the Income category; spending leaves out transfers between the user's
      // own accounts and money moved to savings or investments, which is saving, not spending.
      const trend = monthlyTrend.get(monthKey(t.date));
      const spending = isSpending(catalog, t);
      const saving = spending && bucketOf(catalog, t) === "savings";
      if (trend) {
        const id = categoryIdOf(t);
        if (t.amountCents > 0 && id !== null && topCategoryId(id) === "income") trend.incomeCents += t.amountCents;
        else if (saving) trend.savedCents += Math.abs(t.amountCents);
        else if (spending) trend.spendingCents += Math.abs(t.amountCents);
        if (spending && !saving && t.category) {
          const category = canonicalCategoryId(t.category);
          const months = byCategory.get(category) ?? new Map<string, number>();
          months.set(monthKey(t.date), (months.get(monthKey(t.date)) ?? 0) + Math.abs(t.amountCents));
          byCategory.set(category, months);
        }
      }
      if (!spending || !t.category) continue;
      const key = monthKey(t.date);
      const target = key === month ? current : key === previousMonth ? prior : null;
      const category = canonicalCategoryId(t.category);
      if (target) target.set(category, (target.get(category) ?? 0) + Math.abs(t.amountCents));
    }
    const categories = new Set([...current.keys(), ...prior.keys()]);
    const thisMonth = monthlyTrend.get(month)!;
    return {
      month,
      spentCents: thisMonth.spendingCents,
      savedCents: thisMonth.savedCents,
      monthlyTrend: trendKeys.map((key) => ({ month: key, ...monthlyTrend.get(key)! })),
      categoryTrend: Object.fromEntries([...byCategory].map(([category, months]) => [category, trendKeys.map((key) => months.get(key) ?? 0)])),
      categories: [...categories]
        .map((category) => {
          const spentCents = current.get(category) ?? 0;
          return { category, spentCents, changeVsPriorMonthCents: spentCents - (prior.get(category) ?? 0) };
        })
        .sort((a, b) => b.spentCents - a.spentCents),
    };
  };

  /** The user's budgets with what is spent, left and projected, in the order of the category list. */
  const budgetsFor = async (userId: string): Promise<Budget[]> => {
    const [{ profile, catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const order = new Map(catalog.list.map((c, i) => [c.id, i]));
    return profile.budgets
      .map((b) => ({ ...b, category: canonicalCategoryId(b.category) }))
      .filter((b) => catalog.byId.has(b.category))
      .sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0))
      .map((b) => budgetRow(b.category, b.monthlyLimitCents, transactions, catalog, deps.today()));
  };

  return { transactionsOf, load, summaryFor, budgetsFor };
}

export function registerSpendingRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { transactionsOf, load, summaryFor, budgetsFor } = spendingContext(deps);
  const requireCategory = (catalog: Catalog, id: string) => {
    const category = catalog.byId.get(id);
    if (!category) throw new HttpError(404, "not_found", "That category does not exist.");
    return category;
  };
  const save = (profile: SpendingProfile) => deps.spending.save(profile);

  /* ─── Categories ─────────────────────────────────────────────────────────── */

  mount(app, deps, routes.listSpendingCategories, async ({ userId }) => (await load(userId)).catalog.list);

  mount(app, deps, routes.createSpendingCategory, async ({ userId, body }) => {
    const { profile, catalog } = await load(userId);
    const parent = requireCategory(catalog, body.parentId);
    if (categoryDepth(parent.id) >= MAX_CATEGORY_DEPTH) {
      throw new HttpError(400, "too_deep", `Categories go ${MAX_CATEGORY_DEPTH} levels deep at most.`);
    }
    if (parent.bucket === "excluded" && body.bucket) {
      throw new HttpError(400, "excluded_bucket", "Income and transfers are not spending, so they have no bucket.");
    }
    const label = body.label.trim();
    const taken = catalog.list.some((c) => c.parentId === parent.id && c.label.toLowerCase() === label.toLowerCase());
    if (taken) throw new HttpError(409, "duplicate", `${parent.label} already has a category called ${label}.`);

    const record = { id: `${parent.id}.c${randomUUID().replace(/-/g, "").slice(0, 8)}`, label, parentId: parent.id, bucket: body.bucket ?? null, hidden: false };
    await save({ ...profile, categories: [...profile.categories, record] });
    const created = buildCatalog({ ...profile, categories: [...profile.categories, record] }).byId.get(record.id);
    if (!created) throw new HttpError(500, "internal", "The new category could not be read back.");
    return created;
  });

  mount(app, deps, routes.updateSpendingCategory, async ({ userId, params, body }) => {
    const { profile, catalog } = await load(userId);
    const id = params.id ?? "";
    const current = requireCategory(catalog, id);
    if (body.bucket && current.bucket === "excluded") {
      throw new HttpError(400, "excluded_bucket", "Income and transfers are not spending, so they have no bucket.");
    }
    let next: SpendingProfile;
    if (current.custom) {
      next = {
        ...profile,
        categories: profile.categories.map((c) =>
          c.id === id ? { ...c, label: body.label ?? c.label, hidden: body.hidden ?? c.hidden, bucket: body.bucket ?? c.bucket } : c,
        ),
      };
    } else {
      const existing = profile.overrides.find((o) => o.id === id) ?? { id, label: null, hidden: false, bucket: null };
      const updated = { ...existing, label: body.label ?? existing.label, hidden: body.hidden ?? existing.hidden, bucket: body.bucket ?? existing.bucket };
      next = { ...profile, overrides: [...profile.overrides.filter((o) => o.id !== id), updated] };
    }
    await save(next);
    return buildCatalog(next).byId.get(id)!;
  });

  mount(app, deps, routes.deleteSpendingCategory, async ({ userId, params }) => {
    const { profile, catalog } = await load(userId);
    const id = params.id ?? "";
    const target = requireCategory(catalog, id);
    if (!target.custom) throw new HttpError(400, "default_category", "Default categories can be hidden, not deleted.");
    const parentId = parentCategoryId(id)!;
    const removed = (other: string) => other === id || other.startsWith(`${id}.`);

    // Transactions in the category, or under it, move up to its parent.
    let movedTransactions = 0;
    for (const t of await transactionsOf(userId)) {
      if (!t.subcategory || !removed(t.subcategory)) continue;
      const { id: txId, ...rest } = t;
      await deps.ledger.updateTransaction(userId, txId, { ...rest, ...assignCategory(parentId) });
      movedTransactions += 1;
    }
    await save({
      ...profile,
      categories: profile.categories.filter((c) => !removed(c.id)),
      overrides: profile.overrides.filter((o) => !removed(o.id)),
      budgets: profile.budgets.filter((b) => !removed(b.category)),
      rules: profile.rules.map((r) => (removed(r.categoryId) ? { ...r, categoryId: parentId } : r)),
    });
    return { deleted: true as const, movedTransactions };
  });

  /* ─── Needs, Wants and Savings ─────────────────────────────────────────── */

  mount(app, deps, routes.getBucketSummary, async ({ userId }) => {
    const [{ profile, catalog }, income, transactions] = await Promise.all([
      load(userId),
      deps.ledger.getIncomeProfile(userId),
      transactionsOf(userId),
    ]);
    const month = monthKey(deps.today());
    const spent: Record<BudgetedBucket, number> = { needs: 0, wants: 0, savings: 0 };
    let uncategorizedCents = 0;
    for (const t of transactions) {
      if (monthKey(t.date) !== month || !isSpending(catalog, t)) continue;
      const bucket = bucketOf(catalog, t);
      if (bucket && bucket !== "excluded") spent[bucket] += Math.abs(t.amountCents);
      else uncategorizedCents += Math.abs(t.amountCents);
    }
    const incomeCents = income?.monthlyIncomeCents ?? 0;
    return {
      month,
      incomeCents,
      split: profile.split,
      buckets: (["needs", "wants", "savings"] as const).map((bucket) => ({
        bucket,
        spentCents: spent[bucket],
        targetCents: Math.round(incomeCents * profile.split[bucket]),
        shareOfIncome: incomeCents > 0 ? spent[bucket] / incomeCents : 0,
      })),
      uncategorizedCents,
    };
  });

  mount(app, deps, routes.updateSpendingSplit, async ({ userId, body }) => {
    const { profile } = await load(userId);
    return (await save({ ...profile, split: body })).split;
  });

  /* ─── Budgets ──────────────────────────────────────────────────────────── */

  mount(app, deps, routes.listBudgets, ({ userId }) => budgetsFor(userId));

  mount(app, deps, routes.setBudget, async ({ userId, body }) => {
    const [{ profile, catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const category = requireCategory(catalog, body.category);
    if (category.bucket === "excluded") {
      throw new HttpError(400, "excluded_budget", "Income and transfers are not spending, so they take no budget.");
    }
    const budgets = [...profile.budgets.filter((b) => canonicalCategoryId(b.category) !== category.id), { category: category.id, monthlyLimitCents: body.monthlyLimitCents }];
    await save({ ...profile, budgets });
    return budgetRow(category.id, body.monthlyLimitCents, transactions, catalog, deps.today());
  });

  mount(app, deps, routes.deleteBudget, async ({ userId, params }) => {
    const { profile } = await load(userId);
    const id = params.category ?? "";
    const budgets = profile.budgets.filter((b) => canonicalCategoryId(b.category) !== id);
    if (budgets.length === profile.budgets.length) throw new HttpError(404, "not_found", "There is no budget for that category.");
    await save({ ...profile, budgets });
    return { deleted: true as const };
  });

  mount(app, deps, routes.getSpendingBreakdown, async ({ userId }) => {
    const [{ catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const month = monthKey(deps.today());
    const totals = new Map<string, number>();
    for (const t of transactions) {
      const id = categoryIdOf(t);
      if (!id || monthKey(t.date) !== month || !isSpending(catalog, t)) continue;
      totals.set(id, (totals.get(id) ?? 0) + Math.abs(t.amountCents));
    }
    return [...totals].map(([categoryId, spentCents]) => ({ categoryId, spentCents })).sort((a, b) => b.spentCents - a.spentCents);
  });

  mount(app, deps, routes.listTopExpenses, async ({ userId, query }) => {
    const [{ catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const month = monthKey(deps.today());
    return transactions
      .filter((t) => monthKey(t.date) === month && isSpending(catalog, t))
      // A purchase is a choice made this time: not saving, and not a charge that repeats on its own.
      .filter((t) => query.kind === "all" || (!t.isRecurring && bucketOf(catalog, t) !== "savings"))
      .sort((a, b) => a.amountCents - b.amountCents)
      .slice(0, query.limit);
  });

  /* ─── Merchant rules ───────────────────────────────────────────────────── */

  mount(app, deps, routes.listCategoryRules, async ({ userId }) => (await load(userId)).profile.rules);

  mount(app, deps, routes.createCategoryRule, async ({ userId, body }) => {
    const { profile, catalog } = await load(userId);
    requireCategory(catalog, body.categoryId);
    const merchantContains = body.merchantContains.trim();
    const rule = { id: randomUUID(), merchantContains, categoryId: body.categoryId, createdAt: deps.now() };
    // One rule per merchant text: a new one replaces the old.
    const rules = [...profile.rules.filter((r) => r.merchantContains.toLowerCase() !== merchantContains.toLowerCase()), rule];
    await save({ ...profile, rules });

    let updatedTransactions = 0;
    if (body.applyToPast) {
      for (const t of await transactionsOf(userId)) {
        if (ruleCategoryFor([rule], t.merchant) === null) continue;
        const next = assignCategory(rule.categoryId);
        if (t.category === next.category && t.subcategory === next.subcategory) continue;
        const { id: txId, ...rest } = t;
        await deps.ledger.updateTransaction(userId, txId, { ...rest, ...next });
        updatedTransactions += 1;
      }
    }
    return { rule, updatedTransactions };
  });

  mount(app, deps, routes.deleteCategoryRule, async ({ userId, params }) => {
    const { profile } = await load(userId);
    const rules = profile.rules.filter((r) => r.id !== params.id);
    if (rules.length === profile.rules.length) throw new HttpError(404, "not_found", "That rule does not exist.");
    await save({ ...profile, rules });
    return { deleted: true as const };
  });

  /* ─── Recurring charges and bills ──────────────────────────────────────── */

  const recurringCharges = (userId: string) => recurringChargesFor(deps, userId);

  mount(app, deps, routes.listRecurring, async ({ userId }) =>
    (await recurringCharges(userId)).sort((a, b) => a.nextDate.localeCompare(b.nextDate)),
  );

  mount(app, deps, routes.listUpcomingBills, async ({ userId }) => {
    const [charges, accounts] = await Promise.all([recurringCharges(userId), deps.ledger.listAccounts(userId)]);
    const loans = liabilityBills(accounts);
    const streams = withoutCoveredStreams(charges, loans);
    const today = deps.today();
    const end = addDays(today, BILL_WINDOW_DAYS);
    return [...loans, ...streams]
      .filter((bill) => bill.nextDate >= today && bill.nextDate <= end)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  });

  /* ─── Patterns: days, weekdays, merchants ─────────────────────────────── */

  mount(app, deps, routes.getSpendingPatterns, async ({ userId, query }) => {
    const [{ catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const today = deps.today();
    const month = query.month ?? monthKey(today);
    if (month > monthKey(today)) throw new HttpError(400, "future_month", "That month has not happened yet.");
    // The same idea of "spending" as the monthly summary: not income, not transfers, not savings.
    const rows = transactions
      .filter((t) => isSpending(catalog, t) && bucketOf(catalog, t) !== "savings")
      .map((t) => ({ date: t.date, merchant: t.merchant, cents: Math.abs(t.amountCents) }));
    return spendingPatterns(rows, month, today);
  });

  /* ─── Monthly summary ─────────────────────────────────────────────────── */

  mount(app, deps, routes.getSpendingSummary, ({ userId }) => summaryFor(userId));

  /* ─── Overview: runway and savings rate ───────────────────────────────── */

  mount(app, deps, routes.getOverviewInsights, async ({ userId }) => {
    const [summary, accounts] = await Promise.all([summaryFor(userId), deps.ledger.listAccounts(userId)]);
    return overviewInsights(liquidCashCents(accounts), summary.monthlyTrend);
  });
}
