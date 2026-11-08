import { formatPercent, formatUsd, type SimulationRun } from "@finvantage/contracts";
import {
  DEFAULT_LOAN_TERM_MONTHS,
  GROWTH_RETURN_HIGH,
  GROWTH_RETURN_LOW,
  GROWTH_RETURN_TYPICAL,
} from "@finvantage/math-core";
import { forModel, oddsRange, type AdvisorReadApi } from "./read-api";

export interface AdvisorBrief {
  /** Sent to the model each turn. Money is in dollar strings. */
  brief: Record<string, unknown>;
  /** The same facts as sentences, written in code, for the safe answer. */
  lines: string[];
  /** Category id to label, for tools that show categories. */
  categoryLabels: Map<string, string>;
  latestRun: SimulationRun | null;
}

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * A compact, code-computed picture of the user's whole financial life, one section per page.
 * A section that fails to load is left out rather than failing the turn.
 */
export async function buildAdvisorBrief(api: AdvisorReadApi, today: string): Promise<AdvisorBrief> {
  const [me, netWorth, income, buckets, budgets, bills, goals, runs, lifeEvents, reports, scans, categories] =
    await Promise.all([
      settle(api.getMe()),
      settle(api.getNetWorth()),
      settle(api.getIncomeSummary()),
      settle(api.getBucketSummary()),
      settle(api.listBudgets()),
      settle(api.listUpcomingBills()),
      settle(api.listGoals()),
      settle(api.listSimulationRuns()),
      settle(api.listLifeEvents()),
      settle(api.listReports()),
      settle(api.listCopilotEvents()),
      settle(api.listSpendingCategories()),
    ]);

  const categoryLabels = new Map((categories ?? []).map((c) => [c.id, c.label]));
  const label = (id: string | null) => (id ? (categoryLabels.get(id) ?? id) : "Uncategorized");
  const latestRun = runs?.[0] ?? null;
  const lines: string[] = [];
  const brief: Record<string, unknown> = {
    today,
    name: me?.displayName ?? null,
    // Named defaults the tools use when the user gives none. State them when you rely on them.
    assumptions: {
      defaultLoanTermMonths: DEFAULT_LOAN_TERM_MONTHS,
      // Only when the user gives no rate and a web search finds none. Say they're assumed.
      fallbackGrowthReturnPercents: [GROWTH_RETURN_LOW, GROWTH_RETURN_TYPICAL, GROWTH_RETURN_HIGH].map((r) => Math.round(r * 100)),
    },
  };

  if (netWorth) {
    brief.netWorth = forModel({
      netWorthCents: netWorth.netWorthCents,
      assetsCents: netWorth.assetsCents,
      liabilitiesCents: netWorth.liabilitiesCents,
      byCategory: netWorth.byCategory,
    });
    lines.push(
      `Net worth: ${formatUsd(netWorth.netWorthCents)} (${formatUsd(netWorth.assetsCents)} in assets, ${formatUsd(netWorth.liabilitiesCents)} owed).`,
    );
  }

  if (income) {
    brief.income = forModel({
      month: income.month,
      thisMonthCents: income.thisMonthCents,
      lastMonthCents: income.lastMonthCents,
      averageMonthlyCents: income.averageMonthlyCents,
      savingsRate: income.savingsRate,
      stability: income.stability,
      debtToIncomeRatio: income.debtToIncome.ratio,
    });
    lines.push(
      `Income: ${formatUsd(income.thisMonthCents)} so far this month, ${formatUsd(income.averageMonthlyCents)} a month on average.` +
        (income.savingsRate === null ? "" : ` Savings rate ${formatPercent(income.savingsRate)}.`),
    );
  }

  if (buckets) {
    brief.needsWantsSavings = forModel({ month: buckets.month, buckets: buckets.buckets });
  }

  if (budgets) {
    const flagged = budgets.filter((b) => b.status !== "on_track");
    brief.budgets = forModel({
      total: budgets.length,
      overOrAtRisk: flagged.map((b) => ({ ...b, category: label(b.category) })),
    });
    for (const b of flagged.slice(0, 3)) {
      lines.push(
        `${label(b.category)} budget ${b.status === "over" ? "is over" : "is at risk"}: ${formatUsd(b.spentCents)} spent of ${formatUsd(b.limitCents)}.`,
      );
    }
  }

  if (bills) {
    const totalCents = bills.reduce((sum, bill) => sum + Math.abs(bill.amountCents), 0);
    brief.upcomingBills = forModel({ countNext14Days: bills.length, totalCents, bills: bills.slice(0, 6) });
    if (bills.length > 0) {
      lines.push(`${bills.length === 1 ? "1 bill" : `${bills.length} bills`} due in the next 14 days, ${formatUsd(totalCents)} in total.`);
    }
  }

  if (goals) {
    const outcome = (id: string) => latestRun?.goalOutcomes.find((o) => o.goalId === id) ?? null;
    brief.goals = goals.map((g) => {
      const o = outcome(g.id);
      return {
        ...(forModel(g) as object),
        likelihood: o ? oddsRange(o.probabilityLow, o.probabilityHigh) : null,
        medianCompletionDate: o?.medianCompletionDate ?? null,
      };
    });
    for (const g of goals.slice(0, 3)) {
      const o = outcome(g.id);
      lines.push(
        `${g.name}: ${formatUsd(g.currentCents)} of ${formatUsd(g.targetCents)} by ${g.targetDate}` +
          (o ? `, estimated ${oddsRange(o.probabilityLow, o.probabilityHigh)} likely.` : "."),
      );
    }
  }

  if (lifeEvents) {
    brief.lifeEvents = forModel(lifeEvents.slice(0, 5));
  }

  if (reports && reports[0]) {
    const r = reports[0];
    brief.latestReport = {
      quarter: r.quarter,
      largestChange: r.largestChange,
      nextSteps: r.nextSteps,
      reportsAvailable: reports.map((x) => x.quarter),
    };
    if (r.largestChange) {
      lines.push(`Latest report (${r.quarter}): biggest change was ${r.largestChange.label}, ${r.largestChange.previousValue} to ${r.largestChange.currentValue}.`);
    }
  }

  if (scans) {
    brief.recentCopilotScans = scans.slice(0, 3).map((e) => ({
      id: e.id,
      merchant: e.merchant,
      pageType: e.pageType,
      price: formatUsd(e.extractedPriceCents),
      verdict: e.metrics.verdict,
      advice: e.card.impact,
      at: e.createdAt,
    }));
    brief.copilotScanCount = scans.length;
    const last = scans[0];
    if (last) lines.push(`Latest Copilot scan: ${last.merchant}, ${formatUsd(last.extractedPriceCents)} (${last.metrics.verdict}).`);
  }

  return { brief, lines, categoryLabels, latestRun };
}
