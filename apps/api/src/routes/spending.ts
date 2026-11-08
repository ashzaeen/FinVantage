import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import {
  MAX_CATEGORY_DEPTH,
  PLAID_DETAILED_CATEGORY,
  assignCategory,
  canonicalCategoryId,
  categoryDepth,
  parentCategoryId,
  routes,
  topCategoryId,
  type Account,
  type Budget,
  type BudgetedBucket,
  type RecurringCharge,
  type Transaction,
} from "@finvantage/contracts";
import type { RecurringStream, SpendingProfile } from "@finvantage/data";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { buildCatalog, bucketOf, categoryIdOf, countsToward, isSpending, ruleCategoryFor, type Catalog } from "../spending/catalog";

const BILL_WINDOW_DAYS = 14;
const SUGGESTION_MONTHS = 3;

const monthKey = (date: string) => date.slice(0, 7);

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function shiftMonth(month: string, by: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
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
  let recentCents = 0;
  let recentSeen = false;
  for (const t of transactions) {
    if (!isSpending(catalog, t) || !countsToward(category, t)) continue;
    const key = monthKey(t.date);
    if (key === month) spentCents += Math.abs(t.amountCents);
    else if (recent.has(key)) {
      recentCents += Math.abs(t.amountCents);
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
    suggestedLimitCents: recentSeen ? Math.round(recentCents / SUGGESTION_MONTHS) : null,
  };
}

const CADENCE: Record<RecurringStream["frequency"], RecurringCharge["cadence"]> = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  SEMI_MONTHLY: "semi_monthly",
  MONTHLY: "monthly",
  ANNUALLY: "yearly",
  UNKNOWN: "unknown",
};

function streamCharge(stream: RecurringStream): RecurringCharge | null {
  if (!stream.predictedNextDate) return null;
  const mapped = stream.categoryDetailed ? PLAID_DETAILED_CATEGORY[stream.categoryDetailed] : undefined;
  return {
    merchant: stream.merchant,
    amountCents: -stream.amountCents,
    cadence: CADENCE[stream.frequency],
    nextDate: stream.predictedNextDate,
    accountId: stream.accountId,
    category: mapped ?? null,
    source: "bank",
  };
}

/** The category a loan or card payment falls in, matching how Plaid categorizes the payment. */
function liabilityCategory(account: Account): string {
  if (account.type === "mortgage") return "housing.mortgage";
  if (account.type === "credit_card") return "transfers.credit_card_payment";
  // `loanKind` has no student value yet, so student loans read as personal loans.
  return account.loanKind === "auto" ? "debt_payments.car" : "debt_payments.personal";
}

/** Loan and card payments with a due date, from the bank's liability data. */
function liabilityBills(accounts: Account[]): RecurringCharge[] {
  return accounts.flatMap((a) =>
    a.nextPaymentDueOn && a.minimumPaymentCents
      ? [
          {
            merchant: a.name,
            amountCents: -a.minimumPaymentCents,
            cadence: "monthly" as const,
            nextDate: a.nextPaymentDueOn,
            accountId: a.id,
            category: liabilityCategory(a),
            source: "bank" as const,
          },
        ]
      : [],
  );
}

/** Without the bank's streams: recurring transactions, assumed monthly. */
function estimatedCharges(transactions: Transaction[]): RecurringCharge[] {
  const latest = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.isRecurring || t.amountCents >= 0) continue;
    const key = `${t.accountId}:${t.merchant.toLowerCase()}`;
    const previous = latest.get(key);
    if (!previous || t.date > previous.date) latest.set(key, t);
  }
  return [...latest.values()].map((t) => ({
    merchant: t.merchant,
    amountCents: t.amountCents,
    cadence: "monthly" as const,
    nextDate: addDays(t.date, 30),
    accountId: t.accountId,
    category: t.subcategory ?? t.category,
    source: "estimate" as const,
  }));
}

export function registerSpendingRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const transactionsOf = (userId: string) => deps.ledger.listTransactions(userId, 5000);
  const load = async (userId: string) => {
    const profile = await deps.spending.get(userId);
    return { profile, catalog: buildCatalog(profile) };
  };
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

  mount(app, deps, routes.listBudgets, async ({ userId }) => {
    const [{ profile, catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const order = new Map(catalog.list.map((c, i) => [c.id, i]));
    return profile.budgets
      .map((b) => ({ ...b, category: canonicalCategoryId(b.category) }))
      .filter((b) => catalog.byId.has(b.category))
      .sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0))
      .map((b) => budgetRow(b.category, b.monthlyLimitCents, transactions, catalog, deps.today()));
  });

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

  const recurringCharges = async (userId: string) => {
    const streams = (await deps.ledger.listRecurringStreams?.(userId)) ?? [];
    const fromBank = streams.flatMap((s) => streamCharge(s) ?? []);
    return fromBank.length ? fromBank : estimatedCharges(await transactionsOf(userId));
  };

  mount(app, deps, routes.listRecurring, async ({ userId }) =>
    (await recurringCharges(userId)).sort((a, b) => a.nextDate.localeCompare(b.nextDate)),
  );

  mount(app, deps, routes.listUpcomingBills, async ({ userId }) => {
    const [charges, accounts] = await Promise.all([recurringCharges(userId), deps.ledger.listAccounts(userId)]);
    const loans = liabilityBills(accounts);
    // A due date already covers that kind of payment, so drop its matching stream.
    const covered = new Set(loans.map((l) => l.category));
    const streams = charges.filter((c) => !c.category || !covered.has(c.category));
    const today = deps.today();
    const end = addDays(today, BILL_WINDOW_DAYS);
    return [...loans, ...streams]
      .filter((bill) => bill.nextDate >= today && bill.nextDate <= end)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  });

  /* ─── Monthly summary ─────────────────────────────────────────────────── */

  mount(app, deps, routes.getSpendingSummary, async ({ userId }) => {
    const [{ catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    const month = monthKey(deps.today());
    const previousMonth = shiftMonth(month, -1);
    const current = new Map<string, number>();
    const prior = new Map<string, number>();
    const trendKeys = Array.from({ length: 6 }, (_, offset) => shiftMonth(month, offset - 5));
    const monthlyTrend = new Map(trendKeys.map((key) => [key, { incomeCents: 0, spendingCents: 0 }]));
    for (const t of transactions) {
      // Income is money in the Income category; spending leaves out transfers between the user's
      // own accounts and money moved to savings or investments, which is saving, not spending.
      const trend = monthlyTrend.get(monthKey(t.date));
      if (trend) {
        const id = categoryIdOf(t);
        if (t.amountCents > 0 && id !== null && topCategoryId(id) === "income") trend.incomeCents += t.amountCents;
        else if (isSpending(catalog, t) && bucketOf(catalog, t) !== "savings") trend.spendingCents += Math.abs(t.amountCents);
      }
      if (!isSpending(catalog, t) || !t.category) continue;
      const key = monthKey(t.date);
      const target = key === month ? current : key === previousMonth ? prior : null;
      const category = canonicalCategoryId(t.category);
      if (target) target.set(category, (target.get(category) ?? 0) + Math.abs(t.amountCents));
    }
    const categories = new Set([...current.keys(), ...prior.keys()]);
    return {
      month,
      monthlyTrend: trendKeys.map((key) => ({ month: key, ...monthlyTrend.get(key)! })),
      categories: [...categories]
        .map((category) => {
          const spentCents = current.get(category) ?? 0;
          return { category, spentCents, changeVsPriorMonthCents: spentCents - (prior.get(category) ?? 0) };
        })
        .sort((a, b) => b.spentCents - a.spentCents),
    };
  });
}
