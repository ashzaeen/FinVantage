import type { Hono } from "hono";
import { ASSET_CLASS_LABEL, routes } from "@finvantage/contracts";
import { demoInvestments } from "@finvantage/data";
import { buildInvestmentsOverview } from "@finvantage/math-core";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

async function investmentsOverview(deps: AppDeps) {
  const market = await deps.market.snapshot({ today: deps.today(), now: deps.now() });
  return buildInvestmentsOverview({ ...demoInvestments(), market });
}

const indexed = (changeRate: number) => Math.round((1 + changeRate) * 1_000) / 10;

/** P2 views. These stay mocked in v1, and the contract forces `mocked: true`. */
export function registerMockedRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.getInvestments, async () => investmentsOverview(deps));

  /** The Advisor reads this shape. It reports the same holdings as the Investments page. */
  mount(app, deps, routes.getPortfolio, async () => {
    const all = (await investmentsOverview(deps)).views[0]!;
    const points = all.performance["3M"].points;
    return {
      mocked: true as const,
      holdings: all.holdings.map((h) => ({ symbol: h.symbol, name: h.name, valueCents: h.valueCents })),
      allocation: all.allocation.map((s) => ({ assetClass: ASSET_CLASS_LABEL[s.assetClass], weight: s.weight })),
      benchmark: [points[0]!, points[points.length - 1]!].map((p) => ({
        date: p.at,
        portfolio: indexed(p.portfolioChangeRate),
        benchmark: indexed(p.benchmarkChangeRate),
      })),
    };
  });

  mount(app, deps, routes.getCreditScore, async () => ({
    mocked: true as const,
    score: 742,
    history: [
      { date: "2026-05-01", score: 718 },
      { date: "2026-06-01", score: 723 },
      { date: "2026-07-01", score: 727 },
      { date: "2026-08-01", score: 731 },
      { date: "2026-09-01", score: 735 },
      { date: "2026-10-01", score: 738 },
      { date: "2026-11-01", score: 742 },
    ],
  }));
}
