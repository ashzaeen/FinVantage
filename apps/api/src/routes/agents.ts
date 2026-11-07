import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { routes } from "@finvantage/contracts";
import { generateOptions, generateQuarterlyReport } from "@finvantage/llm";
import type { AppDeps } from "../deps";
import { mount, type AppEnv } from "../mount";

export function registerAgentRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  mount(app, deps, routes.getAdvice, async ({ userId, body }) => {
    const [goals, runs] = await Promise.all([
      deps.ledger.listGoals(userId),
      deps.docs.listSimulationRuns(userId),
    ]);
    const options = await generateOptions(deps.llm, {
      situation: body.situation,
      goals,
      latestRunId: runs[0]?.id ?? null,
    });
    return deps.docs.saveRecommendation({
      id: randomUUID(),
      userId,
      situation: body.situation,
      options,
      createdAt: new Date().toISOString(),
    });
  });

  mount(app, deps, routes.listReports, ({ userId }) => deps.docs.listReports(userId));

  mount(app, deps, routes.generateReport, async ({ userId, body }) => {
    const [previous] = await deps.docs.listReports(userId);
    const report = await generateQuarterlyReport(deps.llm, body.quarter);
    return deps.docs.saveReport({
      ...report,
      id: randomUUID(),
      userId,
      quarter: body.quarter,
      previousReportId: previous?.id ?? null,
      createdAt: new Date().toISOString(),
    });
  });
}
