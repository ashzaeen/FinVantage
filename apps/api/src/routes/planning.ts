import type { Hono } from "hono";
import { SimulationRequest, canonicalCategoryId, routes, topCategoryId } from "@finvantage/contracts";
import {
  allocationDrift,
  attentionItems,
  budgetSuggestions,
  copilotImpact,
  creditCardsOverview,
  creditWhatIf,
  debtPayoff,
  debtToIncome,
  goalAllocation,
  goalFunding,
  healthScore,
  liquidCashCents,
  MONEY_CALENDAR_DAYS,
  moneyCalendar,
  overviewInsights,
  paydaysAhead,
  safeToSpend,
  spendingPace,
  stressMonthlyChange,
  unusualCharges,
} from "@finvantage/math-core";
import { forecastCash, projectRetirement, simulate } from "@finvantage/simulator";
import type { AppDeps } from "../deps";
import { HttpError, mount, type AppEnv } from "../mount";
import { loadInputs, runSimulation } from "../services";
import { bucketOf, categoryIdOf, isSpending } from "../spending/catalog";
import { loadSubscriptions } from "../spending/subscriptions";
import { investmentsOverview, MOCK_CREDIT_SCORE } from "./mocked";
import { spendingContext } from "./spending";

/** The stress test and retirement fan run at a fixed seed, so the same switches give the same answer. */
const STRESS_SEED = 42;
const STRESS_PATHS = 2_000;
/** Full months of housing spending that make up "the usual rent". */
const STRESS_RENT_MONTHS = 3;

function shiftMonthKey(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Full months of savings rate the health score averages. */
const HEALTH_RATE_MONTHS = 3;

/**
 * Figures that plan ahead: what is safe to spend, what needs a look, what each goal needs, how a
 * month is paced, and the what-ifs on credit, debt and allocation. Handlers only gather inputs;
 * the arithmetic is in `math-core`.
 */
export function registerPlanningRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { transactionsOf, load, summaryFor, budgetsFor } = spendingContext(deps);

  /** Money out that counts as spending: not income, not transfers, not savings. */
  const spendRowsOf = async (userId: string) => {
    const [{ catalog }, transactions] = await Promise.all([load(userId), transactionsOf(userId)]);
    return { catalog, transactions, spending: transactions.filter((t) => isSpending(catalog, t) && bucketOf(catalog, t) !== "savings") };
  };

  mount(app, deps, routes.getSafeToSpend, async ({ userId }) => {
    const [accounts, summary, income, subs, { profile }] = await Promise.all([
      deps.ledger.listAccounts(userId),
      summaryFor(userId),
      deps.ledger.getIncomeProfile(userId),
      loadSubscriptions(deps, userId),
      load(userId),
    ]);
    const thisMonth = summary.monthlyTrend.at(-1);
    return safeToSpend({
      asOf: deps.today(),
      checkingCents: accounts.filter((a) => a.type === "checking").reduce((sum, a) => sum + a.balanceCents, 0),
      expectedIncomeCents: income?.monthlyIncomeCents ?? 0,
      receivedIncomeCents: thisMonth?.incomeCents ?? 0,
      bills: subs.details.filter((d) => d.status !== "cancelled").map((d) => ({ nextDate: d.nextDate, cents: Math.abs(d.amountCents) })),
      savingsShare: profile.split.savings,
      savedCents: summary.savedCents,
    });
  });

  mount(app, deps, routes.getMoneyCalendar, async ({ userId }) => {
    const today = deps.today();
    const [accounts, subs, transactions] = await Promise.all([deps.ledger.listAccounts(userId), loadSubscriptions(deps, userId), transactionsOf(userId)]);
    const paychecks = transactions.filter((t) => t.amountCents > 0 && categoryIdOf(t) === "income.paycheck").map((t) => ({ date: t.date, amountCents: t.amountCents }));
    const { dates, expectedCents } = paydaysAhead(paychecks, today, MONEY_CALENDAR_DAYS);
    return moneyCalendar({
      asOf: today,
      checkingCents: accounts.filter((a) => a.type === "checking").reduce((sum, a) => sum + a.balanceCents, 0),
      paydays: dates,
      paydayCents: expectedCents,
      bills: subs.details.filter((d) => d.status !== "cancelled").map((d) => ({ date: d.nextDate, label: d.merchant, cents: Math.abs(d.amountCents) })),
      cardDues: creditCardsOverview(accounts, today).cards.flatMap((c) => (c.nextPaymentDueOn ? [{ date: c.nextPaymentDueOn, label: c.name, cents: c.minimumPaymentCents }] : [])),
    });
  });

  mount(app, deps, routes.stressTest, async ({ userId, body }) => {
    const base = await loadInputs(deps, userId, null, { bankCashFlow: true });
    if (!base) throw new HttpError(404, "no_data", "Load the demo profile first.");
    // The usual rent: housing spending over the last three full months.
    const today = deps.today();
    const months = new Set(Array.from({ length: STRESS_RENT_MONTHS }, (_, i) => shiftMonthKey(today.slice(0, 7), -(i + 1))));
    const transactions = await transactionsOf(userId);
    const housing = transactions.filter((t) => t.amountCents < 0 && months.has(t.date.slice(0, 7)) && (categoryIdOf(t) ?? "").startsWith("housing"));
    const monthlyRentCents = Math.round(housing.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / STRESS_RENT_MONTHS);
    const monthlyChangeCents = stressMonthlyChange({ monthlyIncomeCents: base.snapshot.monthlyIncomeCents, monthlyRentCents, incomeDropShare: body.incomeDropShare, rentRiseShare: body.rentRiseShare });
    const stressedInputs = { ...base, whatIf: { monthlySavingsDeltaCents: monthlyChangeCents, purchaseAmountCents: 0, eventShifts: [] } };
    const options = { seed: STRESS_SEED, paths: STRESS_PATHS };
    const [before, after] = [simulate(base, options), simulate(stressedInputs, options)];
    const range = (o: (typeof before.goalOutcomes)[number] | undefined) => ({ low: o?.probabilityLow ?? 0, high: o?.probabilityHigh ?? 0, medianDate: o?.medianCompletionDate ?? null });
    return {
      incomeDropShare: body.incomeDropShare,
      rentRiseShare: body.rentRiseShare,
      monthlyChangeCents,
      monthlyIncomeCents: base.snapshot.monthlyIncomeCents,
      monthlyRentCents,
      goals: base.goals.map((g) => ({ goalId: g.id, name: g.name, before: range(before.goalOutcomes.find((o) => o.goalId === g.id)), after: range(after.goalOutcomes.find((o) => o.goalId === g.id)) })),
      baselineCash: forecastCash(base, options),
      stressedCash: forecastCash(stressedInputs, options),
    };
  });

  mount(app, deps, routes.projectRetirement, async ({ userId, body }) => {
    const accounts = await deps.ledger.listAccounts(userId);
    const retirement = accounts.filter((a) => a.type === "ira");
    const startingCents = retirement.reduce((sum, a) => sum + a.balanceCents, 0);
    return {
      ...projectRetirement({ asOf: deps.today(), startingCents, monthlyContributionCents: body.monthlyContributionCents, years: body.years }, { seed: STRESS_SEED, paths: STRESS_PATHS }),
      mocked: true as const,
      startingFromAccounts: retirement.length > 0,
    };
  });

  mount(app, deps, routes.getAttention, async ({ userId }) => {
    const today = deps.today();
    const [accounts, budgets, subs, { catalog }] = await Promise.all([deps.ledger.listAccounts(userId), budgetsFor(userId), loadSubscriptions(deps, userId), load(userId)]);
    const cards = creditCardsOverview(accounts, today).cards;
    return {
      asOf: today,
      items: attentionItems({
        asOf: today,
        cards: cards.map((c) => ({ id: c.id, name: c.name, nextPaymentDueOn: c.nextPaymentDueOn, daysUntilDue: c.daysUntilDue, promoRateEndsOn: c.promoRateEndsOn, promoDaysLeft: c.promoClear?.daysLeft ?? null })),
        budgets: budgets.map((b) => ({ category: b.category, label: catalog.byId.get(b.category)?.label ?? b.category, status: b.status, remainingCents: b.remainingCents, projectedCents: b.projectedCents, limitCents: b.limitCents })),
        charges: subs.details.map((d) => ({ id: d.id, merchant: d.merchant, amountCents: d.amountCents, nextDate: d.nextDate, kind: d.kind, status: d.status })),
        subscriptions: subs.details.map((d) => ({ id: d.id, merchant: d.merchant, flags: d.flags })),
      }),
    };
  });

  mount(app, deps, routes.getHealthScore, async ({ userId }) => {
    const today = deps.today();
    const [accounts, summary, income] = await Promise.all([deps.ledger.listAccounts(userId), summaryFor(userId), deps.ledger.getIncomeProfile(userId)]);
    const insights = overviewInsights(liquidCashCents(accounts), summary.monthlyTrend);
    // The savings rate over the last few full months that had income, the same way the Overview figures it.
    const rates = summary.monthlyTrend.slice(0, -1).slice(-HEALTH_RATE_MONTHS).flatMap((p) => (p.incomeCents > 0 ? [p.savedCents / p.incomeCents] : []));
    return healthScore({
      asOf: today,
      savingsRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
      debtToIncome: income && income.monthlyIncomeCents > 0 ? debtToIncome(income.monthlyDebtPaymentsCents, income.monthlyIncomeCents) : null,
      utilization: creditCardsOverview(accounts, today).totals.utilization,
      runwayMonths: insights.runway.months,
    });
  });

  mount(app, deps, routes.getGoalFunding, async ({ userId }) => {
    const [goals, income, run] = await Promise.all([
      deps.ledger.listGoals(userId),
      deps.ledger.getIncomeProfile(userId),
      // A run that is not saved: only its median finish dates are wanted.
      runSimulation(deps, userId, SimulationRequest.parse({ persist: false })).catch(() => null),
    ]);
    return goalFunding({
      asOf: deps.today(),
      goals,
      medianCompletionDates: new Map((run?.goalOutcomes ?? []).map((o) => [o.goalId, o.medianCompletionDate])),
      monthlySavingsCents: income?.monthlySavingsCents ?? 0,
    });
  });

  mount(app, deps, routes.getGoalAllocation, async ({ userId }) => {
    const [goals, income] = await Promise.all([deps.ledger.listGoals(userId), deps.ledger.getIncomeProfile(userId)]);
    const monthlySavingsCents = income?.monthlySavingsCents ?? 0;
    const funding = goalFunding({ asOf: deps.today(), goals, medianCompletionDates: new Map(), monthlySavingsCents });
    const byId = new Map(funding.goals.map((f) => [f.goalId, f]));
    return goalAllocation({
      asOf: deps.today(),
      monthlySavingsCents,
      goals: goals.flatMap((g) => {
        const f = byId.get(g.id);
        // A goal marked achieved needs nothing, whatever its balance says.
        const done = g.status === "achieved" || g.status === "done";
        return f ? [{ id: g.id, name: g.name, priorityRank: g.priorityRank, flexibility: g.flexibility, neededPerMonthCents: done ? 0 : f.neededPerMonthCents, remainingCents: f.remainingCents, monthsLeft: f.monthsLeft }] : [];
      }),
    });
  });

  mount(app, deps, routes.getSpendingPace, async ({ userId }) => {
    const [{ spending }, budgets] = await Promise.all([spendRowsOf(userId), budgetsFor(userId)]);
    const today = deps.today();
    const rows = spending.map((t) => ({ date: t.date, merchant: t.merchant, cents: Math.abs(t.amountCents) }));
    return spendingPace(rows, today.slice(0, 7), today, budgets.length ? budgets.reduce((sum, b) => sum + b.limitCents, 0) : null);
  });

  mount(app, deps, routes.listBudgetSuggestions, async ({ userId }) => {
    const [{ spending }, { profile }] = await Promise.all([spendRowsOf(userId), load(userId)]);
    const budgeted = new Set(profile.budgets.map((b) => topCategoryId(canonicalCategoryId(b.category))));
    const rows = spending.flatMap((t) => (t.category ? [{ date: t.date, category: canonicalCategoryId(t.category), cents: Math.abs(t.amountCents) }] : []));
    return budgetSuggestions(rows, budgeted, deps.today());
  });

  mount(app, deps, routes.listUnusualCharges, async ({ userId }) => {
    const { spending } = await spendRowsOf(userId);
    return unusualCharges(spending);
  });

  mount(app, deps, routes.creditWhatIf, async ({ userId, body }) => {
    const result = creditWhatIf(await deps.ledger.listAccounts(userId), body.cardId, body.paymentCents, MOCK_CREDIT_SCORE);
    if (!result) throw new HttpError(404, "not_found", "That credit card does not exist.");
    return result;
  });

  mount(app, deps, routes.getDebtPayoff, async ({ userId, query }) => debtPayoff(await deps.ledger.listAccounts(userId), query.extraCents, deps.today()));

  const driftFor = async (userId: string) => {
    const [overview, { profile }] = await Promise.all([investmentsOverview(deps), load(userId)]);
    const all = overview.views[0]!;
    return allocationDrift(all.allocation, profile.targetAllocation ?? null);
  };
  mount(app, deps, routes.getAllocationDrift, ({ userId }) => driftFor(userId));
  mount(app, deps, routes.setTargetAllocation, async ({ userId, body }) => {
    const { profile } = await load(userId);
    await deps.spending.save({ ...profile, targetAllocation: body });
    return driftFor(userId);
  });

  mount(app, deps, routes.getCopilotImpact, async ({ userId }) => copilotImpact(await deps.docs.listCopilotEvents(userId), deps.today()));
}
