import { z } from "zod";
import { AdvisorVisual, AdvisorVisualRequest } from "./advisor-visuals";
import { Account, BankItemSummary, CreateTransaction, NetWorth, NewAccount, NewTransaction, Transaction } from "./account";
import {
  EmailSchedule,
  EmailScheduleLogEntry,
  AdvisorChatRequest,
  AdvisorChatRequestBody,
  AdvisorChatResponse,
  AdvisorConversation,
  AdvisorConversationDetail,
  AdvisorTurn,
  CreateAdvisorConversation,
  SendAdvisorMessage,
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
import {
  BucketSummary,
  CategoryRule,
  NewCategoryRule,
  NewSpendingCategory,
  RecategorizeTransaction,
  SpendingCategory,
  SpendingSplit,
  UpdateSpendingCategory,
} from "./categories";
import { Budget, BudgetLimit, CreditScore, Portfolio, IncomeSummary, RecurringCharge, SpendingBreakdownRow, SpendingSummary } from "./spending";
import { InvestmentsOverview } from "./investments";
import { AuthResponse, ExtensionSettings, LogInRequest, SignUpRequest, User } from "./user";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

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
  createAccount: route({ method: "POST", path: "/v1/accounts", body: NewAccount, response: Account }),
  updateAccount: route({ method: "PATCH", path: "/v1/accounts/:id", body: NewAccount, response: Account }),
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
    body: CreateTransaction,
    response: Transaction,
  }),
  updateTransaction: route({
    method: "PATCH",
    path: "/v1/transactions/:id",
    body: NewTransaction.extend({ category: z.string().nullable(), isRecurring: z.boolean() }),
    response: Transaction,
  }),

  // Goals
  listGoals: route({ method: "GET", path: "/v1/goals", response: z.array(Goal) }),
  createGoal: route({ method: "POST", path: "/v1/goals", body: NewGoal, response: Goal }),
  updateGoal: route({ method: "PATCH", path: "/v1/goals/:id", body: NewGoal, response: Goal }),
  deleteGoal: route({ method: "DELETE", path: "/v1/goals/:id", response: z.object({ deleted: z.literal(true) }) }),

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
  /** Removes one Copilot event from the user's activity feed. */
  deleteCopilotEvent: route({
    method: "DELETE",
    path: "/v1/copilot/events/:id",
    response: z.object({ deleted: z.literal(true) }),
  }),
  /** Removes all of the user's Copilot events. Returns how many were removed. */
  clearCopilotEvents: route({
    method: "DELETE",
    path: "/v1/copilot/events",
    response: z.object({ deleted: z.number().int().nonnegative() }),
  }),

  // Agents
  getAdvice: route({
    method: "POST",
    path: "/v1/advisory",
    body: z.object({ situation: Situation }),
    response: Recommendation,
  }),
  advisorChat: route({ method: "POST", path: "/v1/advisory/chat", body: AdvisorChatRequestBody, response: AdvisorChatResponse }),
  /** Recomputes an interactive visual after the user changes an input. Saves nothing. */
  renderAdvisorVisual: route({
    method: "POST",
    path: "/v1/advisory/visuals",
    body: AdvisorVisualRequest,
    response: AdvisorVisual,
  }),
  listRecommendations: route({
    method: "GET",
    path: "/v1/advisory/recommendations",
    response: z.array(Recommendation),
  }),
  listAdvisorConversations: route({
    method: "GET",
    path: "/v1/advisory/conversations",
    response: z.array(AdvisorConversation),
  }),
  createAdvisorConversation: route({
    method: "POST",
    path: "/v1/advisory/conversations",
    body: CreateAdvisorConversation,
    response: AdvisorConversation,
  }),
  getAdvisorConversation: route({
    method: "GET",
    path: "/v1/advisory/conversations/:id",
    response: AdvisorConversationDetail,
  }),
  deleteAdvisorConversation: route({
    method: "DELETE",
    path: "/v1/advisory/conversations/:id",
    response: z.object({ deleted: z.literal(true) }),
  }),
  /** Saves the user's message, answers it, and saves the reply. Never changes financial data. */
  sendAdvisorMessage: route({
    method: "POST",
    path: "/v1/advisory/conversations/:id/messages",
    body: SendAdvisorMessage,
    response: AdvisorTurn,
  }),
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
  listSpendingCategories: route({
    method: "GET",
    path: "/v1/spending/categories",
    response: z.array(SpendingCategory),
  }),
  getBucketSummary: route({
    method: "GET",
    path: "/v1/spending/buckets",
    response: BucketSummary,
  }),
  createSpendingCategory: route({
    method: "POST",
    path: "/v1/spending/categories",
    body: NewSpendingCategory,
    response: SpendingCategory,
  }),
  updateSpendingCategory: route({
    method: "PATCH",
    path: "/v1/spending/categories/:id",
    body: UpdateSpendingCategory,
    response: SpendingCategory,
  }),
  /** Custom categories only. Their transactions move to the parent. */
  deleteSpendingCategory: route({
    method: "DELETE",
    path: "/v1/spending/categories/:id",
    response: z.object({ deleted: z.literal(true), movedTransactions: z.number().int() }),
  }),
  updateSpendingSplit: route({
    method: "PATCH",
    path: "/v1/spending/split",
    body: SpendingSplit,
    response: SpendingSplit,
  }),
  setBudget: route({ method: "POST", path: "/v1/budgets", body: BudgetLimit, response: Budget }),
  deleteBudget: route({
    method: "DELETE",
    path: "/v1/budgets/:category",
    response: z.object({ deleted: z.literal(true) }),
  }),
  getIncomeSummary: route({ method: "GET", path: "/v1/income/summary", response: IncomeSummary }),
  getSpendingBreakdown: route({
    method: "GET",
    path: "/v1/spending/breakdown",
    response: z.array(SpendingBreakdownRow),
  }),
  /** This month's largest purchases, biggest first. Income and transfers are left out. */
  listTopExpenses: route({
    method: "GET",
    path: "/v1/spending/top-expenses",
    query: z.object({ limit: z.coerce.number().int().positive().max(50).default(10) }),
    response: z.array(Transaction),
  }),
  listCategoryRules: route({ method: "GET", path: "/v1/spending/rules", response: z.array(CategoryRule) }),
  createCategoryRule: route({
    method: "POST",
    path: "/v1/spending/rules",
    body: NewCategoryRule,
    response: z.object({ rule: CategoryRule, updatedTransactions: z.number().int() }),
  }),
  deleteCategoryRule: route({
    method: "DELETE",
    path: "/v1/spending/rules/:id",
    response: z.object({ deleted: z.literal(true) }),
  }),
  recategorizeTransaction: route({
    method: "PATCH",
    path: "/v1/transactions/:id/category",
    body: RecategorizeTransaction,
    response: Transaction,
  }),

  // Mocked views (P2)
  getPortfolio: route({ method: "GET", path: "/v1/portfolio", response: Portfolio }),
  getInvestments: route({ method: "GET", path: "/v1/investments", response: InvestmentsOverview }),
  getCreditScore: route({ method: "GET", path: "/v1/credit-score", response: CreditScore }),

  // Bank linking through Plaid. Signed-in users only: the shared demo user can't link a bank.
  createBankLinkToken: route({
    method: "POST",
    path: "/v1/bank/link-token",
    response: z.object({ linkToken: z.string() }),
  }),
  /** Plaid Link's onSuccess public token. Links the bank and runs the first sync. */
  exchangeBankToken: route({
    method: "POST",
    path: "/v1/bank/exchange",
    body: z.object({ publicToken: z.string().min(1) }),
    response: BankItemSummary,
  }),
  /** Sandbox only: links Plaid's test bank without the Link screen. 404 outside sandbox. */
  linkSandboxBank: route({
    method: "POST",
    path: "/v1/bank/sandbox-link",
    response: BankItemSummary,
  }),
  listBankItems: route({ method: "GET", path: "/v1/bank/items", response: z.array(BankItemSummary) }),
  syncBankItem: route({ method: "POST", path: "/v1/bank/items/:id/sync", response: BankItemSummary }),
  removeBankItem: route({
    method: "DELETE",
    path: "/v1/bank/items/:id",
    response: z.object({ deleted: z.literal(true) }),
  }),
} as const;

/** Server-sent events stream of `LiveEvent`. Not in `routes` because it is not request/response. */
export const LIVE_STREAM_PATH = "/v1/live";

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
