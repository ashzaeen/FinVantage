import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

/** P2 views. These stay mocked in v1, and the contract forces `mocked: true`. */
export function registerMockedRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.getPortfolio, async () => ({
    mocked: true as const,
    holdings: [
      { symbol: "VTI", name: "Total Market ETF", valueCents: 1_680_000 },
      { symbol: "BND", name: "Total Bond ETF", valueCents: 560_000 },
    ],
    allocation: [
      { assetClass: "Stocks", weight: 0.75 },
      { assetClass: "Bonds", weight: 0.25 },
    ],
    benchmark: [
      { date: "2026-08-01", portfolio: 100, benchmark: 100 },
      { date: "2026-11-01", portfolio: 104, benchmark: 103 },
    ],
  }));

  mount(app, deps, routes.getCreditScore, async () => ({
    mocked: true as const,
    score: 742,
    history: [
      { date: "2026-08-01", score: 731 },
      { date: "2026-11-01", score: 742 },
    ],
  }));
}
