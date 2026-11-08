import type { Hono } from "hono";
import { debtToIncome } from "@finvantage/math-core";
import { routes, topCategoryId, type IncomeCategoryRow, type IncomeSource, type Transaction } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";
import { categoryIdOf } from "../spending/catalog";

const TREND_MONTHS = 6;
const AVERAGE_MONTHS = 3;
const STEADY_WITHIN = 0.15;
const RECENT_DEPOSITS = 10;

const monthKey = (date: string) => date.slice(0, 7);

function shiftMonth(month: string, by: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
}

/** Money in from a job or other source. Transfers and refunds are not income. */
const isIncome = (t: Transaction) => {
  const id = categoryIdOf(t);
  return t.amountCents > 0 && !!id && topCategoryId(id) === "income";
};

export function registerIncomeRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.getIncomeSummary, async ({ userId }) => {
    const [transactions, profile] = await Promise.all([
      deps.ledger.listTransactions(userId, 5000),
      deps.ledger.getIncomeProfile(userId),
    ]);
    const month = monthKey(deps.today());
    const months = Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonth(month, i - (TREND_MONTHS - 1)));
    const trend = new Map(months.map((m) => [m, { incomeCents: 0, spendingCents: 0 }]));
    const sources = new Map<string, IncomeSource>();
    const incomeIn = new Map<string, number>();
    const byCategory = new Map<string, { totalCents: number; deposits: number }>();
    const deposits: Transaction[] = [];

    for (const t of transactions) {
      const key = monthKey(t.date);
      const row = trend.get(key);
      if (isIncome(t)) {
        incomeIn.set(key, (incomeIn.get(key) ?? 0) + t.amountCents);
        deposits.push(t);
        if (row) {
          row.incomeCents += t.amountCents;
          if (key === month) {
            const id = categoryIdOf(t) === "income" ? "income.other" : categoryIdOf(t)!;
            const entry = byCategory.get(id) ?? { totalCents: 0, deposits: 0 };
            byCategory.set(id, { totalCents: entry.totalCents + t.amountCents, deposits: entry.deposits + 1 });
          }
          const name = t.merchant.trim();
          const source = sources.get(name.toLowerCase());
          sources.set(name.toLowerCase(), {
            merchant: source?.merchant ?? name,
            totalCents: (source?.totalCents ?? 0) + t.amountCents,
            deposits: (source?.deposits ?? 0) + 1,
            lastDate: source && source.lastDate > t.date ? source.lastDate : t.date,
            isRecurring: (source?.isRecurring ?? false) || t.isRecurring,
          });
        }
      } else if (row && t.amountCents < 0 && categoryIdOf(t) !== null && topCategoryId(categoryIdOf(t)!) !== "transfers") {
        row.spendingCents += Math.abs(t.amountCents);
      }
    }

    const fullMonths = Array.from({ length: AVERAGE_MONTHS }, (_, i) => shiftMonth(month, -(i + 1)));
    const fullTotals = fullMonths.map((m) => incomeIn.get(m) ?? 0);
    const average = Math.round(fullTotals.reduce((a, b) => a + b, 0) / AVERAGE_MONTHS);
    const stability: "steady" | "varies" | "not_enough_data" =
      fullTotals.some((c) => c === 0) || average === 0
        ? "not_enough_data"
        : fullTotals.every((c) => Math.abs(c - average) / average <= STEADY_WITHIN)
          ? "steady"
          : "varies";

    const trendRows = months.map((m) => ({ month: m, ...trend.get(m)! }));
    const income6 = trendRows.reduce((sum, r) => sum + r.incomeCents, 0);
    const spending6 = trendRows.reduce((sum, r) => sum + r.spendingCents, 0);
    const year = month.slice(0, 4);
    const categories: IncomeCategoryRow[] = [...byCategory]
      .map(([categoryId, v]) => ({ categoryId, ...v, share: (incomeIn.get(month) ?? 0) > 0 ? v.totalCents / incomeIn.get(month)! : 0 }))
      .sort((a, b) => b.totalCents - a.totalCents);

    return {
      month,
      expectedMonthlyCents: profile?.monthlyIncomeCents ?? 0,
      thisMonthCents: incomeIn.get(month) ?? 0,
      lastMonthCents: incomeIn.get(shiftMonth(month, -1)) ?? 0,
      averageMonthlyCents: average,
      yearToDateCents: [...incomeIn].filter(([m]) => m.startsWith(year)).reduce((sum, [, c]) => sum + c, 0),
      savingsRate: income6 > 0 ? Math.max(-1, (income6 - spending6) / income6) : null,
      stability,
      trend: trendRows,
      debtToIncome: {
        monthlyDebtCents: profile?.monthlyDebtPaymentsCents ?? 0,
        monthlyIncomeCents: profile?.monthlyIncomeCents ?? 0,
        ratio: profile && profile.monthlyIncomeCents > 0
          ? debtToIncome(profile.monthlyDebtPaymentsCents, profile.monthlyIncomeCents)
          : null,
      },
      categories,
      sources: [...sources.values()].sort((a, b) => b.totalCents - a.totalCents),
      recent: deposits.sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_DEPOSITS),
    };
  });
}
