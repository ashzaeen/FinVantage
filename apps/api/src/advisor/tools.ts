import { z } from "zod";
import {
  formatPercent,
  formatUsd,
  type AdvisorAttachment,
  type AdvisorVisualRequest,
  type GrowthRate,
  ItemType,
  LIFE_EVENT_LABEL,
  LifeEventType,
  type CopilotContext,
  type GoalImpact,
  type LifeEventDraft,
  type NewGoal,
  type PageType,
} from "@finvantage/contracts";
import {
  groundedFigures,
  templateCard,
  withoutFinancialNames,
  type AdvisorTool,
  type AdvisorToolResult,
  type AdvisorTurnState,
} from "@finvantage/llm";
import {
  addMonthsIso,
  applyScenario,
  averageSpendByCategory,
  DEFAULT_LOAN_TERM_MONTHS,
  FALLBACK_GROWTH_RATES,
  futureValue,
  loanFigures,
  monthlyToReach,
  monthsToReach,
  payoffFigures,
  scenarioCashFigures,
  type ScenarioChange,
  computeCopilotMetrics,
  evaluateExpression,
  expressionNumbers,
  goalPlan,
  planSpendingCuts,
  spendingMonths,
  purchaseForSimulator,
} from "@finvantage/math-core";
import { diffOutcomes, evaluatePurchase, simulate } from "@finvantage/simulator";
import type { AppDeps } from "../deps";
import { loadInputs, runSimulation } from "../services";
import type { AdvisorBrief } from "./brief";
import { buildVisual } from "./visuals";
import { forModel, oddsRange, type AdvisorReadApi } from "./read-api";

export interface AdvisorToolContext {
  api: AdvisorReadApi;
  deps: AppDeps;
  userId: string;
  brief: AdvisorBrief;
  /** Everything the user has typed in this conversation, to check amounts they stated. */
  userTexts: string[];
  /** The user's name and email, which must never leave in a web search query. */
  privateNames: string[];
}

function tool<S extends z.ZodObject>(
  name: string,
  description: string,
  params: S,
  run: (args: z.output<S>, turn: AdvisorTurnState) => Promise<AdvisorToolResult>,
): AdvisorTool {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(params) as Record<string, unknown>;
  return {
    name,
    description,
    parameters,
    run: async (raw, turn) => {
      const parsed = params.safeParse(raw);
      if (!parsed.success) throw new Error(`Bad arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      return run(parsed.data, turn);
    },
  };
}

const none = z.object({});

/** A goal's change in the form the user sees it: ranges, never one number. */
function describeImpact(i: GoalImpact) {
  return {
    goal: i.goalName,
    likelihoodBefore: oddsRange(i.probabilityLowAfter - i.probabilityLowDelta, i.probabilityHighAfter - i.probabilityHighDelta),
    likelihoodAfter: oddsRange(i.probabilityLowAfter, i.probabilityHighAfter),
    changeInPoints: Math.round(((i.probabilityLowDelta + i.probabilityHighDelta) / 2) * 100),
    delayMonths: i.delayMonths,
  };
}

function impactSummary(impacts: GoalImpact[]): string[] {
  return impacts.slice(0, 3).map((i) => {
    const d = describeImpact(i);
    return `${d.goal}: ${d.likelihoodBefore} likely before, ${d.likelihoodAfter} after (estimate).`;
  });
}

const PAGE_FOR_ITEM: Record<ItemType, PageType> = {
  rent_monthly: "rental",
  home_listing: "rental",
  retail_purchase: "checkout",
  vehicle: "vehicle_financing",
  credit_card_payment: "debt_payment",
};

const toCents = (dollars: number) => Math.round(dollars * 100);

/**
 * Why a web search query would leak something personal, or null when it is safe to send. A query
 * may name products and topics, including the user's bank's products, but never the user or their
 * own figures. Years and
 * small numbers ("top 5 cards") are fine.
 */
export function privacyProblem(query: string, privateNames: string[], isGrounded: (n: number) => boolean): string | null {
  const lower = query.toLowerCase();
  if (privateNames.some((name) => name.trim().length >= 3 && lower.includes(name.trim().toLowerCase()))) {
    return "it names the user";
  }
  if (/\$\s*\d/.test(query)) return "it contains a dollar amount";
  // "S&P 500" names an index even when the user has $500.
  const personal = expressionNumbers(withoutFinancialNames(query)).filter((n) => n > 12 && !(Number.isInteger(n) && n >= 1990 && n <= 2100) && isGrounded(n));
  return personal.length > 0 ? "it contains the user's own figures" : null;
}

/**
 * Everything the Advisor can look up or work out. Reads go through the app's own GET routes, as
 * the signed-in user. What-ifs run the simulator without saving. Nothing here changes data.
 */
export function advisorTools(ctx: AdvisorToolContext): AdvisorTool[] {
  const { api, deps, userId } = ctx;
  const label = (id: string | null) => (id ? (ctx.brief.categoryLabels.get(id) ?? id) : "Uncategorized");
  /** Sources from this turn's web searches, so a card visual can link to them. */
  const webSources: Array<{ title: string; url: string }> = [];
  /** An interactive visual for the answer. A visual that fails to build is left out, never the answer. */
  const visual = async (request: AdvisorVisualRequest): Promise<AdvisorAttachment[]> => {
    try {
      return [{ kind: "visual", visual: await buildVisual({ deps, userId, api }, request) }];
    } catch {
      return [];
    }
  };

  return [
    tool(
      "search_transactions",
      "Find transactions by merchant, category, date range, amount, or direction. Newest first.",
      z.object({
        merchant: z.string().optional().describe("Part of the merchant name, any case."),
        category: z.string().optional().describe("Part of the category name, such as Dining or Groceries."),
        from: z.string().optional().describe("Earliest date, YYYY-MM-DD."),
        to: z.string().optional().describe("Latest date, YYYY-MM-DD."),
        minAmount: z.number().optional().describe("Smallest size in dollars, ignoring sign."),
        maxAmount: z.number().optional().describe("Largest size in dollars, ignoring sign."),
        direction: z.enum(["in", "out"]).optional().describe("in for deposits, out for spending."),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      async (a) => {
        const all = await api.listTransactions({ query: { limit: 500 } });
        const matches = all.filter((t) => {
          const size = Math.abs(t.amountCents);
          const category = label(t.subcategory ?? t.category).toLowerCase();
          return (
            (!a.merchant || t.merchant.toLowerCase().includes(a.merchant.toLowerCase())) &&
            (!a.category || category.includes(a.category.toLowerCase()) || label(t.category).toLowerCase().includes(a.category.toLowerCase())) &&
            (!a.from || t.date >= a.from) &&
            (!a.to || t.date <= a.to) &&
            (a.minAmount === undefined || size >= toCents(a.minAmount)) &&
            (a.maxAmount === undefined || size <= toCents(a.maxAmount)) &&
            (!a.direction || (a.direction === "in" ? t.amountCents > 0 : t.amountCents < 0))
          );
        });
        const shown = matches.slice(0, a.limit ?? 20);
        const totalCents = matches.reduce((sum, t) => sum + t.amountCents, 0);
        return {
          data: {
            matchCount: matches.length,
            netTotal: formatUsd(totalCents),
            searchedMostRecent: all.length,
            transactions: shown.map((t) => ({
              date: t.date,
              merchant: t.merchant,
              amount: formatUsd(t.amountCents),
              category: label(t.subcategory ?? t.category),
              recurring: t.isRecurring,
              pending: t.pending,
            })),
          },
          citation: `Transactions`,
          summary: [`${matches.length} matching transactions, ${formatUsd(totalCents)} net.`],
        };
      },
    ),

    tool("get_spending", "This month's spending by category with change versus last month, the six-month trend, the needs/wants/savings split, and the top expenses.", none, async () => {
      const [summary, breakdown, top, buckets] = await Promise.all([
        api.getSpendingSummary(),
        api.getSpendingBreakdown(),
        api.listTopExpenses({ query: { limit: 8 } }),
        api.getBucketSummary(),
      ]);
      const categories = summary.categories.map((c) => ({ ...c, category: label(c.category) }));
      return {
        data: forModel({
          month: summary.month,
          categories,
          detailed: breakdown.map((r) => ({ category: label(r.categoryId), spentCents: r.spentCents })),
          monthlyTrend: summary.monthlyTrend,
          needsWantsSavings: buckets,
          topExpenses: top.map((t) => ({ date: t.date, merchant: t.merchant, amountCents: t.amountCents, category: label(t.category) })),
        }),
        citation: "Spending",
        summary: categories.slice(0, 3).map((c) => `${c.category}: ${formatUsd(c.spentCents)} this month.`),
      };
    }),

    tool("get_budgets", "Every budget: limit, spent, remaining, where the month is heading, status, and a suggested limit.", none, async () => {
      const budgets = (await api.listBudgets()).map((b) => ({ ...b, category: label(b.category) }));
      return {
        data: forModel(budgets),
        citation: "Budgets",
        summary: budgets.slice(0, 4).map((b) => `${b.category}: ${formatUsd(b.spentCents)} spent of ${formatUsd(b.limitCents)} (${b.status.replace("_", " ")}).`),
      };
    }),

    tool("get_recurring_and_bills", "Subscriptions and repeat charges with cadence and next date, and bills due in the next 14 days.", none, async () => {
      const [recurring, bills] = await Promise.all([api.listRecurring(), api.listUpcomingBills()]);
      const shape = (r: (typeof recurring)[number]) => ({ ...r, category: label(r.category), accountId: undefined });
      return {
        data: forModel({ recurring: recurring.map(shape), upcomingBills: bills.map(shape) }),
        citation: "Recurring and bills",
        summary: bills.slice(0, 4).map((b) => `${b.merchant}: ${formatUsd(Math.abs(b.amountCents))} due ${b.nextDate}.`),
      };
    }),

    tool("get_income", "Income this month, last month, average, year to date, savings rate, stability, debt-to-income, sources, and recent deposits.", none, async () => {
      const income = await api.getIncomeSummary();
      return {
        data: forModel({ ...income, recent: income.recent.slice(0, 8).map((t) => ({ date: t.date, merchant: t.merchant, amountCents: t.amountCents })) }),
        citation: "Income",
        summary: [`Income: ${formatUsd(income.thisMonthCents)} this month, ${formatUsd(income.averageMonthlyCents)} average.`],
      };
    }),

    tool("get_accounts", "Every account (checking, savings, CDs, IRAs, loans, credit cards, mortgage) with balance, rate, minimum payment, and net worth with its 12-month history.", none, async () => {
      const [accounts, netWorth] = await Promise.all([api.listAccounts(), api.getNetWorth()]);
      return {
        data: forModel({
          accounts: accounts.map((a) => ({ ...a, id: undefined })),
          netWorth,
        }),
        citation: "Accounts",
        summary: accounts.slice(0, 5).map((a) => `${a.name}: ${formatUsd(a.balanceCents)}.`),
      };
    }),

    tool("get_goals", "Every goal with target, saved amount, date, priority, flexibility, and its estimated likelihood from the latest simulation.", none, async () => ({
      data: ctx.brief.brief.goals ?? [],
      citation: "Goals",
    })),

    tool("list_life_events", "Life events the user has logged: type, date, monthly or one-time dollar impact, duration.", none, async () => {
      const events = await api.listLifeEvents();
      return {
        data: forModel(events.map((e) => ({ ...e, label: LIFE_EVENT_LABEL[e.type] }))),
        citation: "Life events",
        summary: events.slice(0, 3).map((e) => `${LIFE_EVENT_LABEL[e.type]} on ${e.date}: ${formatUsd(e.dollarImpactCents)}${e.recurrence === "recurring" ? " a month" : ""}.`),
      };
    }),

    tool(
      "list_copilot_scans",
      "What the Copilot browser extension saw: the page type, merchant, price, the figures it computed, its verdict and advice, and what the user did with the card. Newest first.",
      z.object({
        limit: z.number().int().min(1).max(20).optional(),
        merchant: z.string().optional(),
        id: z.string().optional().describe("One scan by id, with every computed figure."),
      }),
      async (a) => {
        const events = (await api.listCopilotEvents()).filter(
          (e) => (!a.id || e.id === a.id) && (!a.merchant || e.merchant.toLowerCase().includes(a.merchant.toLowerCase())),
        );
        const shown = events.slice(0, a.id ? 1 : (a.limit ?? 5));
        return {
          data: {
            total: events.length,
            scans: shown.map((e) => ({
              id: e.id,
              at: e.createdAt,
              pageType: e.pageType,
              merchant: e.merchant,
              price: formatUsd(e.extractedPriceCents),
              verdict: e.metrics.verdict,
              card: { impact: e.card.impact, tradeOff: e.card.tradeOff, smartMove: e.card.smartMove, keyFigures: e.card.keyFigures },
              userAction: e.userAction,
              ...(a.id ? { metrics: forModel(e.metrics) } : { headline: e.metrics.headline }),
            })),
          },
          citation: "Copilot scans",
          summary: shown.map((e) => `Copilot at ${e.merchant}: ${formatUsd(e.extractedPriceCents)}, ${e.metrics.verdict}. ${e.card.impact}`),
        };
      },
    ),

    tool(
      "get_quarterly_report",
      "A stored quarterly report: what went well and not, why, the largest change and its cause, the look ahead, next steps, and the evidence figures. Without a quarter, the latest.",
      z.object({ quarter: z.string().optional().describe("Such as 2026-Q3.") }),
      async (a) => {
        const reports = await api.listReports();
        const report = a.quarter ? reports.find((r) => r.quarter === a.quarter) : reports[0];
        if (!report) {
          return { data: { found: false, available: reports.map((r) => r.quarter) }, citation: "Quarterly reports" };
        }
        return {
          data: {
            found: true,
            available: reports.map((r) => r.quarter),
            ...forModel({
              quarter: report.quarter,
              previousQuarter: report.previousQuarter,
              wentWell: report.wentWell,
              didNotGoWell: report.didNotGoWell,
              why: report.why,
              largestChange: report.largestChange,
              lookAhead: report.lookAhead,
              nextSteps: report.nextSteps,
              evidence: report.evidence.map(({ sourceId: _id, ...e }) => e),
              summary: report.visuals.summary,
            }) as object,
          },
          citation: `${report.quarter} report`,
          summary: report.largestChange
            ? [`${report.quarter} report: ${report.largestChange.label} went from ${report.largestChange.previousValue} to ${report.largestChange.currentValue}. ${report.largestChange.cause}`]
            : [`${report.quarter} report: ${report.why}`],
        };
      },
    ),

    tool("list_simulation_runs", "Recent saved simulation runs with each goal's estimated likelihood, and how the newest compares to the one before.", z.object({ limit: z.number().int().min(1).max(10).optional() }), async (a) => {
      const runs = (await api.listSimulationRuns()).slice(0, a.limit ?? 3);
      const goals = await api.listGoals();
      const name = (id: string) => goals.find((g) => g.id === id)?.name ?? id;
      const [newest, previous] = runs;
      const change = newest && previous ? diffOutcomes(goals, previous, newest).map(describeImpact) : [];
      return {
        data: {
          runs: runs.map((r) => ({
            id: r.id,
            at: r.createdAt,
            goals: r.goalOutcomes.map((o) => ({ goal: name(o.goalId), likelihood: oddsRange(o.probabilityLow, o.probabilityHigh), medianCompletionDate: o.medianCompletionDate })),
          })),
          newestVersusPrevious: change,
        },
        citation: "Simulations",
      };
    }),

    tool("get_portfolio_and_credit", "The investment portfolio (holdings, allocation, benchmark) and credit score with history. Both are MOCKED demo values: always say so.", none, async () => {
      const [portfolio, credit] = await Promise.all([api.getPortfolio(), api.getCreditScore()]);
      return {
        data: forModel({ mocked: true, portfolio: { ...portfolio, benchmark: portfolio.benchmark.slice(-6) }, creditScore: credit }),
        citation: "Portfolio and credit (mocked)",
        summary: [`Credit score ${credit.score} (mocked demo value).`],
      };
    }),

    tool(
      "run_what_if",
      "Simulate a change without saving it: saving more or less each month, or a one-time purchase. Returns each goal's estimated likelihood before and after.",
      z.object({
        monthlySavingsChange: z.number().optional().describe("Dollars a month; negative saves less."),
        oneTimePurchase: z.number().nonnegative().optional().describe("Dollars spent once, today."),
      }),
      async (a) => {
        const whatIf = {
          monthlySavingsDeltaCents: toCents(a.monthlySavingsChange ?? 0),
          purchaseAmountCents: toCents(a.oneTimePurchase ?? 0),
          eventShifts: [],
        };
        const before = await runSimulation(deps, userId, { persist: false });
        const after = await runSimulation(deps, userId, { persist: false, whatIf });
        const impacts = diffOutcomes(after.inputs.goals, before, after);
        return {
          data: forModel({ change: whatIf, goals: impacts.map(describeImpact), note: "Estimates, not guarantees." }),
          citation: "What-if simulation",
          summary: impactSummary(impacts),
        };
      },
    ),

    tool(
      "check_purchase",
      "Check a purchase the way the Copilot does: cash buffer, runway, debt-to-income, fixed-cost ratio, goal impact, opportunity cost, and a verdict. Saves nothing.",
      z.object({
        price: z.number().positive().describe("Dollars. Monthly for rent."),
        kind: ItemType.describe("rent_monthly, home_listing, retail_purchase, vehicle, or credit_card_payment."),
        merchant: z.string().max(100).optional(),
      }),
      async (a) => {
        const inputs = await loadInputs(deps, userId, null);
        if (!inputs) return { data: { error: "No financial data loaded yet." }, citation: "Purchase check" };
        const context: CopilotContext = {
          pageType: PAGE_FOR_ITEM[a.kind],
          itemType: a.kind,
          priceCents: toCents(a.price),
          merchant: a.merchant ?? "this purchase",
        };
        // Same order as the Copilot route: simulator, then math core, then words.
        const impacts = evaluatePurchase(inputs, purchaseForSimulator(inputs.snapshot, context, inputs.goals));
        const metrics = computeCopilotMetrics(inputs.snapshot, context, impacts, inputs.goals);
        const card = templateCard(context, metrics);
        return {
          data: forModel({ purchase: context, verdict: metrics.verdict, metrics, goals: impacts.map(describeImpact), copilotCard: card }),
          citation: "Purchase check",
          summary: [`${card.impact} ${card.smartMove}`],
        };
      },
    ),

    tool(
      "draft_life_event",
      "Draft a life event the user described, with its projected effect on each goal. It is NOT saved: the user sees a card and must press Confirm. Use only an amount the user stated; if they gave none, ask for it first.",
      z.object({
        type: LifeEventType,
        date: z.iso.date().describe("When it happens, YYYY-MM-DD. Use the first of the month when only a month is known."),
        recurrence: z.enum(["one_time", "recurring"]),
        amount: z.number().positive().describe("Dollars the user stated: the cost, or monthly cost when recurring."),
        isIncome: z.boolean().optional().describe("True when it adds money, such as a raise."),
        durationMonths: z.number().int().positive().optional(),
      }),
      async (a) => {
        const stated = groundedFigures(ctx.userTexts);
        if (!stated.has(String(a.amount)) && !stated.has(String(Math.round(a.amount)))) {
          throw new Error("The user has not stated that amount. Ask them how much it will cost before drafting.");
        }
        const draft: LifeEventDraft = {
          type: a.type,
          date: a.date,
          recurrence: a.recurrence,
          dollarImpactCents: (a.isIncome ? 1 : -1) * toCents(a.amount),
          durationMonths: a.recurrence === "recurring" ? (a.durationMonths ?? null) : null,
          linkedGoalId: null,
          source: "parsed",
        };
        const inputs = await loadInputs(deps, userId, null, { bankCashFlow: true });
        let goalChanges: GoalImpact[] = [];
        if (inputs) {
          const before = simulate(inputs);
          const after = simulate({ ...inputs, lifeEvents: [...inputs.lifeEvents, { ...draft, id: "draft", userId }] });
          goalChanges = diffOutcomes(inputs.goals, before, after);
        }
        return {
          data: forModel({ draft: { ...draft, label: LIFE_EVENT_LABEL[draft.type] }, goals: goalChanges.map(describeImpact), saved: false }),
          citation: "Life event draft",
          summary: [`Draft: ${LIFE_EVENT_LABEL[draft.type]} on ${draft.date}, not saved yet.`, ...impactSummary(goalChanges)],
          attachment: { kind: "life_event_draft", draft, goalChanges },
        };
      },
    ),

    tool(
      "plan_goal",
      "Work out what a goal takes: the amount still needed, months left, and the monthly amount to reach it by its date, next to what the user saves each month now and the goal's current likelihood. Use this before advising how to reach a goal.",
      z.object({ goal: z.string().describe("The goal's name, or part of it.") }),
      async (a) => {
        const goals = await api.listGoals();
        const goal = goals.find((g) => g.name.toLowerCase().includes(a.goal.toLowerCase()));
        if (!goal) return { data: { found: false, goals: goals.map((g) => g.name) }, citation: "Goals" };
        const plan = goalPlan(goal, deps.today());
        const inputs = await loadInputs(deps, userId, null, { bankCashFlow: true });
        const outcome = ctx.brief.latestRun?.goalOutcomes.find((o) => o.goalId === goal.id) ?? null;
        const monthly = plan.monthlyNeededCents;
        return {
          data: forModel({
            goal: goal.name,
            targetCents: goal.targetCents,
            savedCents: goal.currentCents,
            targetDate: goal.targetDate,
            flexibility: goal.flexibility,
            priorityRank: goal.priorityRank,
            stillNeededCents: plan.gapCents,
            monthsLeft: plan.monthsLeft,
            monthlyNeededCents: monthly,
            currentMonthlySavingsAllGoalsCents: inputs?.snapshot.monthlySavingsCents ?? null,
            likelihood: outcome ? oddsRange(outcome.probabilityLow, outcome.probabilityHigh) : null,
            note: "Monthly savings are shared by every goal, in priority order.",
          }),
          citation: "Goal plan",
          summary: monthly === null
            ? [`${goal.name}: ${formatUsd(plan.gapCents)} still needed, and the target date has passed.`]
            : [`${goal.name}: ${formatUsd(plan.gapCents)} still needed over ${plan.monthsLeft} months, about ${formatUsd(monthly)} a month.`],
          attachment: monthly === null || plan.monthsLeft === 0 ? undefined : {
            kind: "calculation",
            label: `Monthly amount to reach ${goal.name}`,
            expression: `(${formatUsd(goal.targetCents)} target - ${formatUsd(goal.currentCents)} saved) / ${plan.monthsLeft} months`,
            result: `${formatUsd(monthly)} a month`,
          },
        };
      },
    ),

    tool(
      "find_savings",
      "Find where a monthly amount could come from: the user's flexible (wants) spending categories with their 3-month averages, realistic cuts (never more than half of a category), and how those cuts would change each goal's likelihood. Give a goal to size the cuts to that goal's monthly need.",
      z.object({
        monthlyAmount: z.number().positive().optional().describe("Dollars a month to free up."),
        goal: z.string().optional().describe("A goal's name; sizes the cuts to its monthly need when no amount is given."),
      }),
      async (a) => {
        const [transactions, categories, goals] = await Promise.all([
          api.listTransactions({ query: { limit: 500 } }),
          api.listSpendingCategories(),
          api.listGoals(),
        ]);
        const goal = a.goal ? goals.find((g) => g.name.toLowerCase().includes(a.goal!.toLowerCase())) : undefined;
        const target = a.monthlyAmount !== undefined
          ? toCents(a.monthlyAmount)
          : goal ? goalPlan(goal, deps.today()).monthlyNeededCents : null;
        const wants = new Set(categories.filter((c) => c.bucket === "wants").map((c) => c.id));
        const { months, basis } = spendingMonths(transactions, deps.today());
        const flexible = averageSpendByCategory(transactions, months).filter((row) => wants.has(row.categoryId));
        const plan = planSpendingCuts(flexible, target);

        let goalsAfter: ReturnType<typeof describeImpact>[] = [];
        let impacts: GoalImpact[] = [];
        if (plan.totalCutCents > 0) {
          const whatIf = { monthlySavingsDeltaCents: plan.totalCutCents, purchaseAmountCents: 0, eventShifts: [] };
          const before = await runSimulation(deps, userId, { persist: false });
          const after = await runSimulation(deps, userId, { persist: false, whatIf });
          impacts = diffOutcomes(after.inputs.goals, before, after);
          goalsAfter = impacts.map(describeImpact);
        }
        const cuts = plan.cuts.map((c) => ({ ...c, category: label(c.categoryId), categoryId: undefined }));
        return {
          data: forModel({
            averagedOver: months,
            basis: basis === "full_months" ? "average of the last three full months" : "this month so far; there is no earlier spending on file",
            targetMonthlyCents: target,
            flexibleCategories: flexible.slice(0, 8).map((r) => ({ category: label(r.categoryId), averageMonthlyCents: r.averageMonthlyCents })),
            suggestedCuts: cuts,
            totalFreedMonthlyCents: plan.totalCutCents,
            coversTarget: plan.coversTarget,
            shortfallMonthlyCents: plan.shortfallCents,
            ifSavedEachMonth: goalsAfter,
            note: "Cuts are capped at half of a category's average. Likelihoods are estimates.",
          }),
          citation: "Savings finder",
          summary: [
            ...cuts.map((c) => `${c.category}: from about ${formatUsd(c.averageMonthlyCents)} to ${formatUsd(c.newMonthlyCents)} a month saves ${formatUsd(c.cutCents)}.`),
            ...impactSummary(impacts),
          ],
          attachment: cuts.length === 0 ? undefined : {
            kind: "calculation",
            label: "Monthly spending cuts",
            expression: cuts.map((c) => `${c.category} ${formatUsd(c.averageMonthlyCents)} average - ${formatUsd(c.cutCents)}`).join("; "),
            result: `${formatUsd(plan.totalCutCents)} a month freed${plan.coversTarget === false ? `, ${formatUsd(plan.shortfallCents)} short of the target` : ""}`,
          },
        };
      },
    ),

    tool(
      "calculate",
      "Exact arithmetic (+ - * / % and parentheses) on figures you already have from the brief, a tool, or the user. Use it for any number you need that no other tool gives, instead of working it out yourself. Every number in the expression must come from those sources; 12 and 100 are always allowed.",
      z.object({
        expression: z.string().max(200).describe("Plain numbers only, in dollars, such as (4500 - 1500) / 7."),
        label: z.string().max(80).describe("What the result means, such as Monthly amount for the Japan trip."),
      }),
      async (a, turn) => {
        const unknown = expressionNumbers(a.expression).filter((n) => !turn.isGrounded(n));
        if (unknown.length > 0) {
          throw new Error(`These numbers are not from the user's data or words: ${unknown.join(", ")}. Look them up with a tool or ask the user.`);
        }
        const value = evaluateExpression(a.expression);
        const result = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
        return {
          data: { label: a.label, expression: a.expression, result },
          citation: "Calculator",
          summary: [`${a.label}: ${a.expression} = ${result}.`],
          attachment: { kind: "calculation", label: a.label, expression: a.expression, result },
        };
      },
    ),

    tool(
      "web_search",
      "Search the public web for current facts the user's data cannot answer: a credit card's or loan's published terms (APR, fees, rewards), bank rates, or general financial rules. Write a generic query about the product or topic. Product names are fine; NEVER put the user's name, balances, or any of their figures in the query.",
      z.object({ query: z.string().min(3).max(150) }),
      async (a, turn) => {
        if (!deps.llm.webSearch) throw new Error("Web search is not available right now.");
        const problem = privacyProblem(a.query, ctx.privateNames, turn.isGrounded);
        if (problem) throw new Error(`Query refused: ${problem}. Search only for the product or topic.`);
        const result = await deps.llm.webSearch({ query: a.query, timeoutMs: 10_000 });
        webSources.push(...result.sources.slice(0, 5));
        return {
          data: { query: a.query, answer: result.answer, sources: result.sources.slice(0, 5).map((s) => s.title), note: "Published terms change; tell the user to confirm with the issuer." },
          citation: "Web search",
          summary: [`From the web (${a.query}): ${result.answer.slice(0, 300)}`],
          attachment: { kind: "web_sources", query: a.query, sources: result.sources.slice(0, 5) },
        };
      },
    ),

    tool(
      "simulate_scenario",
      "Model almost any decision and see its effect before the user commits: combine one-time costs or income on a date, monthly changes with a start and length, a loan (price, down payment, APR, term), saving more or less each month, a new goal, or moving an existing goal's date. Returns each goal's estimated likelihood before and after, new goals' own likelihood, loan figures, monthly savings, debt-to-income, and the cash cushion after upfront costs. Saves nothing. Use only amounts from the user, their data, a web search, or the brief's assumptions.",
      z.object({
        changes: z.array(z.object({
          kind: z.enum(["one_time", "monthly", "loan", "savings_change", "new_goal", "shift_goal"]),
          label: z.string().max(60).describe("What this change is, such as Spring trip or Car loan. For shift_goal, the goal's name."),
          amount: z.number().optional().describe("Dollars. one_time and monthly: positive, with isIncome for money coming in. savings_change: dollars a month, negative to save less. new_goal: the target."),
          isIncome: z.boolean().optional(),
          date: z.string().optional().describe("YYYY-MM-DD. When a one_time change happens, a monthly change or loan starts, or a new goal is due. Defaults to today."),
          months: z.number().int().optional().describe("monthly: how many months it lasts (omit for ongoing). loan: the term. shift_goal: months to move the date, negative for sooner."),
          price: z.number().optional().describe("loan: the full price in dollars."),
          downPayment: z.number().optional().describe("loan: dollars paid upfront."),
          aprPercent: z.number().optional().describe("loan: the APR as a percent, such as 13."),
          savedSoFar: z.number().optional().describe("new_goal: dollars already saved toward it."),
          flexibility: z.enum(["flexible", "non_negotiable"]).optional().describe("new_goal: whether its date can move."),
          priorityRank: z.number().int().positive().optional().describe("new_goal: 1 is funded first. Defaults to last."),
        })).min(1).max(8),
      }),
      async (a, turn) => {
        const numbers = a.changes.flatMap((c) => [c.amount, c.price, c.downPayment, c.aprPercent, c.savedSoFar].filter((n): n is number => n !== undefined));
        const unknown = numbers.filter((n) => !turn.isGrounded(n));
        if (unknown.length > 0) {
          throw new Error(`These amounts are not from the user, their data, a search, or the brief's assumptions: ${unknown.join(", ")}. Ask the user or look them up.`);
        }
        const inputs = await loadInputs(deps, userId, null, { bankCashFlow: true });
        if (!inputs) return { data: { error: "No financial data loaded yet." }, citation: "Scenario" };
        const today = deps.today();
        const goals = inputs.goals;
        const findGoal = (name: string) => goals.find((g) => g.name.toLowerCase().includes(name.toLowerCase()));

        const changes: ScenarioChange[] = a.changes.map((c) => {
          const date = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : today;
          const amountCents = toCents(Math.abs(c.amount ?? 0));
          switch (c.kind) {
            case "one_time":
              return { kind: "one_time", label: c.label, amountCents: c.isIncome ? amountCents : -amountCents, date };
            case "monthly":
              return { kind: "monthly", label: c.label, amountCents: c.isIncome ? amountCents : -amountCents, start: date, months: c.months ?? null };
            case "loan":
              if (c.price === undefined || c.aprPercent === undefined) throw new Error("A loan needs a price and an APR. Ask the user for any they didn't give.");
              return {
                kind: "loan",
                label: c.label,
                priceCents: toCents(c.price),
                downPaymentCents: toCents(c.downPayment ?? 0),
                annualRate: c.aprPercent / 100,
                termMonths: c.months ?? DEFAULT_LOAN_TERM_MONTHS,
                start: date,
              };
            case "savings_change":
              return { kind: "savings_change", label: c.label, monthlyCents: toCents(c.amount ?? 0) };
            case "new_goal":
              if (!c.amount) throw new Error("A new goal needs a target amount.");
              return {
                kind: "new_goal",
                label: c.label,
                targetCents: amountCents,
                savedCents: toCents(c.savedSoFar ?? 0),
                date: date === today ? addMonthsIso(today, 12) : date,
                flexibility: c.flexibility ?? "flexible",
                priorityRank: c.priorityRank ?? null,
              };
            case "shift_goal": {
              const goal = findGoal(c.label);
              if (!goal) throw new Error(`No goal named ${c.label}. The goals are: ${goals.map((g) => g.name).join(", ")}.`);
              return { kind: "shift_goal", label: goal.name, goalId: goal.id, months: c.months ?? 0 };
            }
          }
        });

        const applied = applyScenario(inputs, changes);
        const loanChange = changes.find((c): c is Extract<ScenarioChange, { kind: "loan" }> => c.kind === "loan");
        const before = simulate(inputs);
        const after = simulate(applied.inputs);
        const impacts = diffOutcomes(inputs.goals, before, after);
        const newGoals = applied.addedGoalIds.flatMap((id) => {
          const goal = applied.inputs.goals.find((g) => g.id === id);
          const outcome = after.goalOutcomes.find((o) => o.goalId === id);
          return goal && outcome
            ? [{
                goal: goal.name,
                target: formatUsd(goal.targetCents),
                by: goal.targetDate,
                priorityRank: goal.priorityRank,
                likelihood: oddsRange(outcome.probabilityLow, outcome.probabilityHigh),
                medianCompletionDate: outcome.medianCompletionDate,
                monthlyNeeded: (() => {
                  const need = goalPlan(goal, today).monthlyNeededCents;
                  return need === null ? null : formatUsd(need);
                })(),
              }]
            : [];
        });
        const cash = scenarioCashFigures(inputs.snapshot, applied);
        const assumedTerm = a.changes.some((c) => c.kind === "loan" && c.months === undefined);
        return {
          data: forModel({
            changes: a.changes,
            existingGoals: impacts.map(describeImpact),
            newGoals,
            loans: applied.loans,
            cash: {
              ...cash,
              debtToIncomeBefore: formatPercent(cash.debtToIncomeBefore),
              debtToIncomeAfter: formatPercent(cash.debtToIncomeAfter),
              cushionAfterUpfrontCostsIsBelowTarget: cash.liquidCashAfterUpfrontCents < cash.bufferTargetCents,
            },
            assumptions: assumedTerm ? [`Loan term assumed: ${DEFAULT_LOAN_TERM_MONTHS} months. Say so.`] : [],
            note: "Likelihoods are estimates from a simulation, not guarantees.",
          }),
          citation: "Scenario simulation",
          summary: [
            ...applied.loans.map((l) => `${l.label}: ${formatUsd(l.monthlyPaymentCents)} a month on ${formatUsd(l.financedCents)} borrowed, ${formatUsd(l.totalInterestCents)} in interest.`),
            ...newGoals.map((g) => `${g.goal}: ${g.likelihood} likely by ${g.by} (estimate).`),
            `Monthly savings: ${formatUsd(cash.monthlySavingsBeforeCents)} now, ${formatUsd(cash.monthlySavingsAfterCents)} with these changes.`,
            `Debt-to-income: ${formatPercent(cash.debtToIncomeBefore)} now, ${formatPercent(cash.debtToIncomeAfter)} after.`,
            ...impactSummary(impacts),
          ],
          attachments: [
            ...(loanChange
              ? await visual({
                  kind: "loan_explorer",
                  inputs: {
                    label: loanChange.label,
                    priceCents: loanChange.priceCents,
                    downPaymentCents: loanChange.downPaymentCents,
                    aprPercent: Math.round(loanChange.annualRate * 10_000) / 100,
                    termMonths: loanChange.termMonths,
                  },
                })
              : []),
            ...await (async () => {
              const goal = changes.find((c): c is Extract<ScenarioChange, { kind: "new_goal" }> => c.kind === "new_goal");
              return goal
                ? visual({ kind: "goal_plan", inputs: { name: goal.label, targetCents: goal.targetCents, savedCents: goal.savedCents, targetDate: goal.date } })
                : [];
            })(),
          ],
          attachment: loanChange && applied.loans[0] ? {
            kind: "calculation",
            label: `${loanChange.label} monthly payment`,
            expression: `(${formatUsd(loanChange.priceCents)} price - ${formatUsd(loanChange.downPaymentCents)} down) at ${Math.round(loanChange.annualRate * 10_000) / 100}% APR over ${loanChange.termMonths} months`,
            result: `${formatUsd(applied.loans[0].monthlyPaymentCents)} a month, ${formatUsd(applied.loans[0].totalInterestCents)} total interest`,
          } : undefined,
        };
      },
    ),

    tool(
      "finance_calc",
      "Standard finance formulas, computed exactly. loan: payment, total interest, and total cost. growth: what a lump sum and monthly contributions could grow to, as a range at 4%, 7%, and 10% a year (assumptions, not a forecast). payoff: how long a balance takes to pay off at a monthly payment, and the interest. save_for: the monthly amount to reach a target by a number of months. time_to: months to reach a target at a monthly amount.",
      z.object({
        formula: z.enum(["loan", "growth", "payoff", "save_for", "time_to"]),
        amount: z.number().nonnegative().optional().describe("Dollars. loan: price. growth: starting amount. payoff: balance. save_for and time_to: the target."),
        downPayment: z.number().nonnegative().optional().describe("loan: dollars paid upfront."),
        aprPercent: z.number().nonnegative().optional().describe("loan and payoff: APR as a percent, such as 13."),
        months: z.number().int().positive().optional().describe("loan: term. save_for: months to the target."),
        years: z.number().positive().optional().describe("growth: how many years."),
        monthly: z.number().nonnegative().optional().describe("Dollars a month. growth: contribution. payoff: payment. time_to: saving."),
        saved: z.number().nonnegative().optional().describe("save_for and time_to: dollars already saved."),
        rates: z.array(z.object({
          label: z.string().min(1).max(60).describe("What the rate is, such as S&P 500 (30-year average) or Your 9%."),
          percent: z.number().min(-50).max(50).describe("A yearly return as a percent, such as 10.5."),
          source: z.enum(["user", "web"]).describe("user: the user said it. web: a web_search result gave it."),
        })).max(4).optional().describe("growth: up to four rates to compare. Use the user's own rate, or web_search an investment's historical average return. Omit only when neither exists; fallback assumptions are used and must be called assumptions."),
      }),
      async (a, turn) => {
        const numbers = [a.amount, a.downPayment, a.aprPercent, a.months, a.years, a.monthly, a.saved, ...(a.rates ?? []).map((r) => Math.abs(r.percent))].filter((n): n is number => n !== undefined);
        const unknown = numbers.filter((n) => !turn.isGrounded(n));
        if (unknown.length > 0) {
          throw new Error(`These numbers are not from the user, their data, a search, or the brief's assumptions: ${unknown.join(", ")}.`);
        }
        const need = (value: number | undefined, name: string) => {
          if (value === undefined) throw new Error(`The ${a.formula} formula needs ${name}. Ask the user if they didn't give it.`);
          return value;
        };
        let data: Record<string, unknown>;
        let working: { label: string; expression: string; result: string };
        let growthRates: GrowthRate[] = [];
        switch (a.formula) {
          case "loan": {
            const term = a.months ?? DEFAULT_LOAN_TERM_MONTHS;
            const apr = need(a.aprPercent, "an APR");
            const f = loanFigures(toCents(need(a.amount, "a price")), toCents(a.downPayment ?? 0), apr / 100, term);
            data = { ...f, termMonths: term, termAssumed: a.months === undefined };
            working = { label: "Loan payment", expression: `${formatUsd(f.financedCents)} at ${apr}% APR over ${term} months`, result: `${formatUsd(f.monthlyPaymentCents)} a month, ${formatUsd(f.totalInterestCents)} interest` };
            break;
          }
          case "growth": {
            const years = need(a.years, "a number of years");
            growthRates = a.rates && a.rates.length > 0
              ? a.rates.map((r) => ({ label: r.label, annualReturnPercent: r.percent, source: r.source }))
              : FALLBACK_GROWTH_RATES.map((r) => ({ label: r.label, annualReturnPercent: Math.round(r.annualReturn * 10_000) / 100, source: "assumed" as const }));
            const months = Math.round(years * 12);
            const initial = toCents(a.amount ?? 0);
            const monthly = toCents(a.monthly ?? 0);
            const contributed = initial + monthly * months;
            const results = growthRates.map((r) => ({
              label: r.label,
              source: r.source,
              ratePercent: r.annualReturnPercent,
              valueCents: futureValue(initial, monthly, r.annualReturnPercent / 100, months),
            }));
            data = {
              years,
              contributedCents: contributed,
              results,
              note: growthRates.some((r) => r.source === "assumed")
                ? "These rates are fallback assumptions, not the user's or published figures. Say so. Not a forecast; returns can be negative."
                : "Past returns don't predict future ones. Returns can be negative.",
            };
            working = {
              label: `Growth over ${years} years`,
              expression: `${formatUsd(contributed)} put in, at ${growthRates.map((r) => `${r.annualReturnPercent}%`).join(" / ")} a year`,
              result: results.map((r) => `${r.label} ${formatUsd(r.valueCents)}`).join(" · "),
            };
            break;
          }
          case "payoff": {
            const apr = need(a.aprPercent, "an APR");
            const p = payoffFigures(toCents(need(a.amount, "a balance")), apr / 100, toCents(need(a.monthly, "a monthly payment")));
            data = { ...p, paysOff: p.months !== null };
            working = { label: "Payoff time", expression: `${formatUsd(toCents(a.amount!))} at ${apr}% APR, paying ${formatUsd(toCents(a.monthly!))} a month`, result: p.months === null ? "never: the payment doesn't cover the interest" : `${p.months} months, ${formatUsd(p.totalInterestCents!)} interest` };
            break;
          }
          case "save_for": {
            const months = need(a.months, "a number of months");
            const monthly = monthlyToReach(toCents(need(a.amount, "a target")), toCents(a.saved ?? 0), months);
            data = { monthlyNeededCents: monthly, months };
            working = { label: "Monthly amount needed", expression: `(${formatUsd(toCents(a.amount!))} - ${formatUsd(toCents(a.saved ?? 0))} saved) / ${months} months`, result: monthly === null ? "not possible" : `${formatUsd(monthly)} a month` };
            break;
          }
          case "time_to": {
            const months = monthsToReach(toCents(need(a.amount, "a target")), toCents(a.saved ?? 0), toCents(need(a.monthly, "a monthly amount")));
            data = { months, reachedBy: months === null ? null : addMonthsIso(deps.today(), months) };
            working = { label: "Time to reach it", expression: `(${formatUsd(toCents(a.amount!))} - ${formatUsd(toCents(a.saved ?? 0))} saved) / ${formatUsd(toCents(a.monthly!))} a month`, result: months === null ? "never at that amount" : `${months} months` };
            break;
          }
        }
        const visuals = a.formula === "loan"
          ? await visual({
              kind: "loan_explorer",
              inputs: {
                label: "Loan",
                priceCents: toCents(a.amount!),
                downPaymentCents: toCents(a.downPayment ?? 0),
                aprPercent: a.aprPercent!,
                termMonths: a.months ?? DEFAULT_LOAN_TERM_MONTHS,
              },
            })
          : a.formula === "growth"
            ? await visual({
                kind: "growth_compare",
                inputs: {
                  initialCents: toCents(a.amount ?? 0),
                  monthlyCents: toCents(a.monthly ?? 0),
                  years: Math.max(1, Math.min(50, Math.round(a.years!))),
                  rates: growthRates,
                  sources: growthRates.some((r) => r.source === "web") ? webSources : [],
                },
              })
            : [];
        return {
          data: forModel(data),
          attachments: visuals,
          citation: "Finance calculator",
          summary: [`${working.label}: ${working.expression} = ${working.result}.`],
          attachment: { kind: "calculation", ...working },
        };
      },
    ),

    tool(
      "draft_goal",
      "Propose a new savings goal the user mentioned, with its estimated likelihood and its effect on their other goals. It is NOT saved: the user sees a card and must press Confirm. Use only a target the user stated or a web search found, and say which.",
      z.object({
        name: z.string().min(1).max(60),
        target: z.number().positive().describe("Dollars."),
        date: z.iso.date().describe("When it's needed, YYYY-MM-DD."),
        savedSoFar: z.number().nonnegative().optional(),
        flexibility: z.enum(["flexible", "non_negotiable"]).optional(),
        priorityRank: z.number().int().positive().optional(),
      }),
      async (a, turn) => {
        if (!turn.isGrounded(a.target)) {
          throw new Error(`${a.target} is not from the user or a search. Ask the user what the goal should be.`);
        }
        const inputs = await loadInputs(deps, userId, null, { bankCashFlow: true });
        const lowest = (inputs?.goals ?? []).reduce((max, g) => Math.max(max, g.priorityRank), 0);
        const goal: NewGoal = {
          name: a.name,
          targetCents: toCents(a.target),
          currentCents: toCents(a.savedSoFar ?? 0),
          targetDate: a.date,
          priorityRank: Math.min(a.priorityRank ?? lowest + 1, lowest + 1),
          flexibility: a.flexibility ?? "flexible",
          linkedAccountId: null,
        };
        let goalChanges: GoalImpact[] = [];
        let odds: { low: number; high: number } | null = null;
        if (inputs) {
          const applied = applyScenario(inputs, [{ kind: "new_goal", label: goal.name, targetCents: goal.targetCents, savedCents: goal.currentCents, date: goal.targetDate, flexibility: goal.flexibility, priorityRank: goal.priorityRank }]);
          const before = simulate(inputs);
          const after = simulate(applied.inputs);
          goalChanges = diffOutcomes(inputs.goals, before, after);
          const outcome = after.goalOutcomes.find((o) => o.goalId === applied.addedGoalIds[0]);
          if (outcome) odds = { low: outcome.probabilityLow, high: outcome.probabilityHigh };
        }
        const need = goalPlan(goal, deps.today()).monthlyNeededCents;
        return {
          data: forModel({
            draft: { ...goal, linkedAccountId: undefined },
            likelihood: odds ? oddsRange(odds.low, odds.high) : null,
            monthlyNeededCents: need,
            otherGoals: goalChanges.map(describeImpact),
            saved: false,
          }),
          citation: "Goal draft",
          summary: [
            `Draft goal: ${goal.name}, ${formatUsd(goal.targetCents)} by ${goal.targetDate}, not saved yet.`,
            ...(odds ? [`Estimated ${oddsRange(odds.low, odds.high)} likely.`] : []),
            ...impactSummary(goalChanges),
          ],
          attachments: await visual({ kind: "goal_plan", inputs: { name: goal.name, targetCents: goal.targetCents, savedCents: goal.currentCents, targetDate: goal.targetDate } }).then((v) =>
            v.length > 0 ? v : [{ kind: "goal_draft" as const, goal, probabilityLow: odds?.low ?? null, probabilityHigh: odds?.high ?? null, goalChanges }],
          ),
        };
      },
    ),

    tool(
      "evaluate_card",
      "Weigh a credit card against the user's own spending and card debt: yearly rewards, fee, interest on a carried balance, and plain checks. Shows an interactive card evaluator. Call web_search first for the card's published rewards rate, annual fee, and APR, and pass those numbers exactly; use the high end of an APR range.",
      z.object({
        cardName: z.string().min(1).max(80),
        rewardsPercent: z.number().min(0).max(10).describe("The main cash-back or points rate, as a percent such as 1.5."),
        annualFee: z.number().nonnegative().describe("Dollars a year."),
        aprPercent: z.number().min(0).max(60).describe("The purchase APR as a percent, such as 29.24."),
      }),
      async (a, turn) => {
        const unknown = [a.rewardsPercent, a.annualFee, a.aprPercent].filter((n) => n !== 0 && !turn.isGrounded(n));
        if (unknown.length > 0) throw new Error(`These terms are not from a web search or the user: ${unknown.join(", ")}. Search for the card's terms first.`);
        const built = await buildVisual({ deps, userId, api }, {
          kind: "card_evaluator",
          inputs: {
            cardName: a.cardName,
            rewardsPercent: a.rewardsPercent,
            annualFeeCents: toCents(a.annualFee),
            aprPercent: a.aprPercent,
            monthlySpendCents: null,
            paysInFull: true,
            sources: webSources,
          },
        });
        if (built.kind !== "card_evaluator") throw new Error("Card evaluation failed.");
        const carried = { ...built.inputs, paysInFull: false };
        const ifCarried = built.carriedBalanceCents > 0
          ? await buildVisual({ deps, userId, api }, { kind: "card_evaluator", inputs: carried })
          : null;
        return {
          data: forModel({
            card: a.cardName,
            monthlySpendUsedCents: built.monthlySpendCents,
            spendingBasis: built.spendBasis === "cards" ? "the user's average card spending" : "the user's everyday spending, since their cards show no recent purchases",
            ifPaidInFullEachMonth: built.figures,
            ifBalanceCarried: ifCarried?.kind === "card_evaluator" ? ifCarried.figures : null,
            carriedBalanceCents: built.carriedBalanceCents,
            checks: built.checks,
            creditScore: built.creditScore,
            note: "Terms come from the web and may change. Approval depends on the issuer; the credit score is mocked.",
          }),
          citation: "Card evaluation",
          summary: [
            `${a.cardName}: about ${formatUsd(built.figures.annualRewardsCents)} a year in rewards on ${formatUsd(built.monthlySpendCents)} of monthly card spending, ${formatUsd(built.figures.annualFeeCents)} fee.`,
            ...built.checks.map((c) => `${c.label}: ${c.detail}`),
          ],
          attachments: [{ kind: "visual", visual: built }],
        };
      },
    ),
  ];
}
