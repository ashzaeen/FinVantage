import { z } from "zod";
import { Account, NetWorth, NewTransaction, Transaction } from "./account";
import {
  EmailSchedule,
  EmailScheduleLogEntry,
  AdvisorChatRequest,
  AdvisorChatRequestBody,
  AdvisorChatResponse,
  Quarter,
  QuarterlyReport,
  Recommendation,
  Situation,
  UpdateEmailScheduleInput,
} from "./advisory";
import {
  CopilotAction,
  CopilotContext,
  CopilotEvaluateResponse,
  CopilotEvent,
} from "./copilot";
import { Goal, NewGoal } from "./goal";
import {
  LifeEvent,
  LifeEventDraft,
  ParseLifeEventRequest,
  ParseLifeEventResponse,
} from "./life-event";
import {
  GoalImpact,
  SimulationDiff,
  SimulationRequest,
  SimulationRun,
  SimulationRunSummary,
} from "./simulation";
import { Budget, CreditScore, Portfolio, RecurringCharge, SpendingSummary } from "./spending";
import { AuthResponse, ExtensionSettings, LogInRequest, SignUpRequest, User } from "./user";

type Method = "GET" | "POST" | "PATCH";

export interface RouteDef<
  P extends string = string,
  R extends z.ZodType = z.ZodType,
  B extends z.ZodType | undefined = z.ZodType | undefined,
  Q extends z.ZodType | undefined = z.ZodType | undefined,
> {
  method: Method;
  path: P;
  response: R;
  body?: B;
  query?: Q;
}

function route<
  P extends string,
  R extends z.ZodType,
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
>(def: RouteDef<P, R, B, Q>): RouteDef<P, R, B, Q> {
  return def;
}

/**
 * The single source of truth for the HTTP API. The server (`mount`) and the client
 * (`createApiClient`) are both typed from this table and validate against it at runtime.
 * Add or change an endpoint here first.
 */
export const routes = {
  // Auth. These two need no token; every /v1 route does.
  signUp: route({ method: "POST", path: "/auth/signup", body: SignUpRequest, response: AuthResponse }),
  logIn: route({ method: "POST", path: "/auth/login", body: LogInRequest, response: AuthResponse }),

  // Profile
  getMe: route({ method: "GET", path: "/v1/me", response: User }),
  updateExtensionSettings: route({
    method: "PATCH",
    path: "/v1/me/extension-settings",
    body: ExtensionSettings,
    response: User,
  }),
  loadDemoProfile: route({
    method: "POST",
    path: "/v1/profile/load-demo",
    response: z.object({ accounts: z.number().int() }),
  }),

  // Accounts and ledger
  listAccounts: route({ method: "GET", path: "/v1/accounts", response: z.array(Account) }),
  getNetWorth: route({ method: "GET", path: "/v1/net-worth", response: NetWorth }),
  listTransactions: route({
    method: "GET",
    path: "/v1/transactions",
    query: z.object({ limit: z.coerce.number().int().positive().max(500).default(50) }),
    response: z.array(Transaction),
  }),
  addTransaction: route({
    method: "POST",
    path: "/v1/transactions",
    body: NewTransaction,
    response: Transaction,
  }),

  // Goals
  listGoals: route({ method: "GET", path: "/v1/goals", response: z.array(Goal) }),
  createGoal: route({ method: "POST", path: "/v1/goals", body: NewGoal, response: Goal }),

  // Life events
  listLifeEvents: route({ method: "GET", path: "/v1/life-events", response: z.array(LifeEvent) }),
  parseLifeEvent: route({
    method: "POST",
    path: "/v1/life-events/parse",
    body: ParseLifeEventRequest,
    response: ParseLifeEventResponse,
  }),
  createLifeEvent: route({
    method: "POST",
    path: "/v1/life-events",
    body: LifeEventDraft,
    response: z.object({
      event: LifeEvent,
      run: SimulationRun,
      goalChanges: z.array(GoalImpact),
    }),
  }),

  // Simulator
  runSimulation: route({
    method: "POST",
    path: "/v1/simulations",
    body: SimulationRequest,
    response: SimulationRun,
  }),
  listSimulations: route({
    method: "GET",
    path: "/v1/simulations",
    response: z.array(SimulationRunSummary),
  }),
  getSimulation: route({ method: "GET", path: "/v1/simulations/:id", response: SimulationRun }),
  diffSimulations: route({
    method: "GET",
    path: "/v1/simulations/:id/diff/:otherId",
    response: SimulationDiff,
  }),

  // Copilot
  evaluateCopilot: route({
    method: "POST",
    path: "/v1/copilot/evaluate",
    body: CopilotContext,
    response: CopilotEvaluateResponse,
  }),
  recordCopilotAction: route({
    method: "POST",
    path: "/v1/copilot/events/:id/action",
    body: z.object({ action: CopilotAction }),
    response: CopilotEvent,
  }),
  listCopilotEvents: route({
    method: "GET",
    path: "/v1/copilot/events",
    response: z.array(CopilotEvent),
  }),

  // Agents
  getAdvice: route({
    method: "POST",
    path: "/v1/advisory",
    body: z.object({ situation: Situation }),
    response: Recommendation,
  }),
  advisorChat: route({ method: "POST", path: "/v1/advisory/chat", body: AdvisorChatRequestBody, response: AdvisorChatResponse }),
  listReports: route({
    method: "GET",
    path: "/v1/reports/quarterly",
    response: z.array(QuarterlyReport),
  }),
  getLatestReport: route({
    method: "GET",
    path: "/v1/reports/quarterly/latest",
    response: QuarterlyReport.nullable(),
  }),
  getReport: route({
    method: "GET",
    path: "/v1/reports/quarterly/:id",
    response: QuarterlyReport,
  }),
  generateReport: route({
    method: "POST",
    path: "/v1/reports/quarterly",
    body: z.object({ quarter: Quarter.optional(), email: z.boolean().default(true) }),
    response: QuarterlyReport,
  }),
  emailReport: route({
    method: "POST",
    path: "/v1/reports/quarterly/:id/email",
    body: z.object({ to: z.string().email().optional() }).optional(),
    response: QuarterlyReport,
  }),
  getEmailSchedule: route({
    method: "GET",
    path: "/v1/reports/schedule",
    response: EmailSchedule.nullable(),
  }),
  updateEmailSchedule: route({
    method: "POST",
    path: "/v1/reports/schedule",
    body: UpdateEmailScheduleInput,
    response: EmailSchedule,
  }),
  triggerScheduledEmail: route({
    method: "POST",
    path: "/v1/reports/schedule/trigger",
    response: z.object({
      success: z.boolean(),
      message: z.string(),
      report: QuarterlyReport.nullable(),
      log: EmailScheduleLogEntry.nullable(),
    }),
  }),
  listEmailScheduleLogs: route({
    method: "GET",
    path: "/v1/reports/schedule/logs",
    response: z.array(EmailScheduleLogEntry),
  }),

  // Spending (P1)
  listBudgets: route({ method: "GET", path: "/v1/budgets", response: z.array(Budget) }),
  listRecurring: route({ method: "GET", path: "/v1/recurring", response: z.array(RecurringCharge) }),
  listUpcomingBills: route({
    method: "GET",
    path: "/v1/bills/upcoming",
    response: z.array(RecurringCharge),
  }),
  getSpendingSummary: route({
    method: "GET",
    path: "/v1/spending/summary",
    response: SpendingSummary,
  }),

  // Mocked views (P2)
  getPortfolio: route({ method: "GET", path: "/v1/portfolio", response: Portfolio }),
  getCreditScore: route({ method: "GET", path: "/v1/credit-score", response: CreditScore }),

  // Bank linking (P2)
  createBankLinkToken: route({
    method: "POST",
    path: "/v1/bank/link-token",
    response: z.object({ linkToken: z.string() }),
  }),
  exchangeBankToken: route({
    method: "POST",
    path: "/v1/bank/exchange",
    body: z.object({ publicToken: z.string() }),
    response: z.object({ accounts: z.array(Account) }),
  }),
} as const;

/** Server-sent events stream of `LiveEvent`. Not in `routes` because it is not request/response. */
export const LIVE_STREAM_PATH = "/v1/live";

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
