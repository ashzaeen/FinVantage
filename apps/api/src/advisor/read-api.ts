import type { Hono } from "hono";
import { createApiClient, formatUsd, type ApiClient, type SimulationRun } from "@finvantage/contracts";
import type { AppDeps } from "../deps";
import type { AppEnv } from "../mount";

/** The routes the Advisor may read. All are GETs, so nothing it does can change the user's data. */
const READ_ROUTES = [
  "getMe",
  "listAccounts",
  "getNetWorth",
  "listTransactions",
  "listGoals",
  "listLifeEvents",
  "listCopilotEvents",
  "listRecommendations",
  "listReports",
  "listBudgets",
  "listRecurring",
  "listUpcomingBills",
  "getSpendingSummary",
  "listSpendingCategories",
  "getBucketSummary",
  "getIncomeSummary",
  "getSpendingBreakdown",
  "listTopExpenses",
  "getPortfolio",
  "getCreditScore",
] as const satisfies ReadonlyArray<keyof ApiClient>;

export type AdvisorReadApi = Pick<ApiClient, (typeof READ_ROUTES)[number]> & {
  /** Full runs with outcomes, newest first. The list route returns summaries only. */
  listSimulationRuns(): Promise<SimulationRun[]>;
};

/**
 * The app's own read routes, called in process as the signed-in user. The Advisor then sees
 * exactly what each page shows, computed by the same code, and responses are contract-checked.
 */
export function advisorReadApi(
  app: Hono<AppEnv>,
  deps: AppDeps,
  userId: string,
  authorization: string,
): AdvisorReadApi {
  const client = createApiClient({
    baseUrl: "",
    token: authorization.replace(/^Bearer /, ""),
    fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
  });
  return {
    ...(Object.fromEntries(READ_ROUTES.map((name) => [name, client[name]])) as Pick<ApiClient, (typeof READ_ROUTES)[number]>),
    listSimulationRuns: () => deps.docs.listSimulationRuns(userId),
  };
}

/** Fields that are large and add nothing a sentence could use. */
const DROP_KEYS = new Set(["fan", "logoUrl", "userId", "inputs", "prioritySetup", "raw"]);

/**
 * Shapes a record for the model: every `...Cents` field becomes a dollar string under the same
 * name without the suffix, so the model reads "$450" and never has to convert or calculate.
 */
export function forModel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(forModel);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (DROP_KEYS.has(key)) continue;
    if (/Cents$/.test(key) && typeof v === "number") {
      out[key.replace(/Cents$/, "") || "amount"] = formatUsd(v);
    } else {
      out[key] = forModel(v);
    }
  }
  return out;
}

/** "62-85%", the form every probability takes in front of the user. */
export function oddsRange(low: number, high: number): string {
  const lo = Math.round(low * 100);
  const hi = Math.round(high * 100);
  return lo === hi ? `about ${lo}%` : `${lo}-${hi}%`;
}
