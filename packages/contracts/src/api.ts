import { z } from "zod";
import { AdvisorVisual, AdvisorVisualRequest } from "./advisor-visuals";
import { SpeakRequest, SpeakResponse } from "./speech";
import { PeriodQuery, PeriodSummary } from "./period";
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
import { CancellationGuide, SubscriptionDetail, SubscriptionDraft, SubscriptionDraftRequest, SubscriptionOverview, UpdateSubscription } from "./subscription";
import {
  LifeScenario,
  LifeScenarioAnalysis,
  LifeScenarioInput,
  LifeScenarioPdfResponse,
  LifeScenarioApplyResponse,
  LifeScenarioConfirmResponse,
  LifeScenarioUndoResponse,
  LifeSimulatorContext,
  NewLifeScenario,
} from "./life-scenario";
import {
  LifeEvent,
  LifeEventDraft,
  ParseLifeEventRequest,
  ParseLifeEventResponse,
} from "./life-event";
import {
  LifeEventPreview,
  LifeEventPreviewRequest,
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
import { BulkRecategorize, BulkRecategorized, SpendingPatterns, SplitTransaction, TransactionSummary, TransactionSummaryRequest } from "./transaction-insights";
import { CreditCardsOverview, GoalMilestones, OverviewInsights } from "./insights";
import {
  AllocationDrift,
  AttentionFeed,
  BudgetSuggestion,
  CopilotImpact,
  CreditWhatIf,
  CreditWhatIfRequest,
  DebtPayoff,
  GoalFunding,
  HealthScore,
  GoalAllocation,
  MoneyCalendar,
  RetirementProjection,
  RetirementRequest,
  StressRequest,
  StressResult,
  SafeToSpend,
  SpendingPace,
  TargetAllocation,
  UnusualCharge,
} from "./planning";
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
  // Auth. These three need no token; every /v1 route does.
  signUp: route({ method: "POST", path: "/auth/signup", body: SignUpRequest, response: AuthResponse }),
  logIn: route({ method: "POST", path: "/auth/login", body: LogInRequest, response: AuthResponse }),
  // A private, short-lived copy of the demo profile for one signed-out visitor, so no visitor can
  // write into data another visitor (or their Advisor) reads. See docs/security-review.
  startGuestSession: route({ method: "POST", path: "/auth/guest", response: AuthResponse }),

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
    query: z.object({
      limit: z.coerce.number().int().positive().max(500).default(50),
      /** Also return the transactions the user hid. They are flagged `hidden`. */
      includeHidden: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    }),
    response: z.array(Transaction),
  }),
  /**
   * Delete a transaction. One the user entered by hand is deleted for real; one synced from the
   * bank is hidden instead (left out of lists and totals, kept through syncs) and can be restored.
   */
  removeTransaction: route({
    method: "DELETE",
    path: "/v1/transactions/:id",
    response: z.object({ result: z.enum(["deleted", "hidden"]) }),
  }),
  /** Brings a hidden bank transaction back into lists and totals. */
  restoreTransaction: route({ method: "POST", path: "/v1/transactions/:id/restore", response: Transaction }),
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
  /** Removes a saved life event and re-runs the simulation, so the odds drop it at once. */
  deleteLifeEvent: route({
    method: "DELETE",
    path: "/v1/life-events/:id",
    response: z.object({ deleted: z.literal(true), run: SimulationRun }),
  }),
  previewLifeEvent: route({
    method: "POST",
    path: "/v1/life-events/preview",
    body: LifeEventPreviewRequest,
    response: LifeEventPreview,
  }),
  // Life simulator: stateless context + analysis, plus persisted, mutable scenarios.
  getLifeSimulatorContext: route({
    method: "GET",
    path: "/v1/life-simulator/context",
    response: LifeSimulatorContext,
  }),
  analyzeLifeScenario: route({
    method: "POST",
    path: "/v1/life-simulator/analyze",
    body: LifeScenarioInput,
    response: LifeScenarioAnalysis,
  }),
  exportLifeScenarioPdf: route({
    method: "POST",
    path: "/v1/life-simulator/export/pdf",
    body: LifeScenarioInput,
    response: LifeScenarioPdfResponse,
  }),
  listLifeScenarios: route({
    method: "GET",
    path: "/v1/life-simulator/scenarios",
    response: z.array(LifeScenario),
  }),
  createLifeScenario: route({
    method: "POST",
    path: "/v1/life-simulator/scenarios",
    body: NewLifeScenario,
    response: LifeScenario,
  }),
  getLifeScenario: route({
    method: "GET",
    path: "/v1/life-simulator/scenarios/:id",
    response: LifeScenario,
  }),
  updateLifeScenario: route({
    method: "PATCH",
    path: "/v1/life-simulator/scenarios/:id",
    body: NewLifeScenario,
    response: LifeScenario,
  }),
  deleteLifeScenario: route({
    method: "DELETE",
    path: "/v1/life-simulator/scenarios/:id",
    response: z.object({ deleted: z.literal(true) }),
  }),
  applyLifeScenario: route({
    method: "POST",
    path: "/v1/life-simulator/scenarios/:id/apply",
    response: LifeScenarioApplyResponse,
  }),
  confirmLifeScenario: route({
    method: "POST",
    path: "/v1/life-simulator/scenarios/:id/confirm",
    response: LifeScenarioConfirmResponse,
  }),
  undoLifeScenario: route({
    method: "POST",
    path: "/v1/life-simulator/scenarios/:id/undo",
    response: LifeScenarioUndoResponse,
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
  /** Audio for one chunk of a saved Advisor reply. Only saved replies can be spoken. 503 `voice_unavailable` means the client should use the browser's voice. */
  speakAdvisorReply: route({ method: "POST", path: "/v1/advisory/speak", body: SpeakRequest, response: SpeakResponse }),
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

  // Subscriptions: recurring charges split into subscriptions and bills, with what is worth a look
  listSubscriptions: route({ method: "GET", path: "/v1/subscriptions", response: SubscriptionOverview }),
  getSubscription: route({ method: "GET", path: "/v1/subscriptions/:id", response: SubscriptionDetail }),
  updateSubscription: route({ method: "PATCH", path: "/v1/subscriptions/:id", body: UpdateSubscription, response: SubscriptionDetail }),
  getSubscriptionGuide: route({ method: "GET", path: "/v1/subscriptions/:id/guide", response: CancellationGuide }),
  // Calls the model, so it is rate limited with the other model routes. It sends nothing anywhere.
  draftSubscriptionMessage: route({ method: "POST", path: "/v1/subscriptions/:id/draft", body: SubscriptionDraftRequest, response: SubscriptionDraft }),

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
  /** Cash runway and savings rate, for the Overview. */
  getOverviewInsights: route({ method: "GET", path: "/v1/overview/insights", response: OverviewInsights }),
  /** What is left to spend this month without missing a bill or a savings target. */
  getSafeToSpend: route({ method: "GET", path: "/v1/overview/safe-to-spend", response: SafeToSpend }),
  /** Where monthly savings go across goals, in priority order, and a suggested reorder when a fixed-date goal is short. */
  getGoalAllocation: route({ method: "GET", path: "/v1/goals/allocation", response: GoalAllocation }),
  /** Thirty days of paydays, bills and card payments, with checking projected day by day. */
  getMoneyCalendar: route({ method: "GET", path: "/v1/overview/calendar", response: MoneyCalendar }),
  /** Savings and goal odds with less income and/or higher rent. Changes nothing. */
  stressTest: route({ method: "POST", path: "/v1/life-events/stress", body: StressRequest, response: StressResult }),
  /** What a retirement balance could look like, as a range, from retirement accounts and a monthly contribution. Mocked. */
  projectRetirement: route({ method: "POST", path: "/v1/investments/retirement", body: RetirementRequest, response: RetirementProjection }),
  /** The few things worth a look today, most urgent first. */
  getAttention: route({ method: "GET", path: "/v1/overview/attention", response: AttentionFeed }),
  /** Four parts and one score: savings rate, debt-to-income, utilization and runway. */
  getHealthScore: route({ method: "GET", path: "/v1/health-score", response: HealthScore }),
  /** What each goal needs a month to reach its target on its date. */
  getGoalFunding: route({ method: "GET", path: "/v1/goals/funding", response: GoalFunding }),
  /** This month's spending day by day, against last month and the budgets. */
  getSpendingPace: route({ method: "GET", path: "/v1/spending/pace", response: SpendingPace }),
  /** Limits worth setting for categories that have spending and no budget. Suggestions only: nothing is saved. */
  listBudgetSuggestions: route({ method: "GET", path: "/v1/budgets/suggestions", response: z.array(BudgetSuggestion) }),
  /** Charges far above what the same merchant usually charges. */
  listUnusualCharges: route({ method: "GET", path: "/v1/transactions/unusual", response: z.array(UnusualCharge) }),
  /** What paying a card down does to utilization and an estimated (mocked) score range. Changes nothing. */
  creditWhatIf: route({ method: "POST", path: "/v1/credit/what-if", body: CreditWhatIfRequest, response: CreditWhatIf }),
  /** Avalanche and snowball plans for the user's cards and loans, with an optional extra payment each month. */
  getDebtPayoff: route({
    method: "GET",
    path: "/v1/debt/payoff",
    query: z.object({ extraCents: z.coerce.number().int().min(0).max(100_000_000).default(0) }),
    response: DebtPayoff,
  }),
  /** Actual against target allocation, with the dollars to move. Mocked, like the rest of Investments. */
  getAllocationDrift: route({ method: "GET", path: "/v1/investments/drift", response: AllocationDrift }),
  /** Saves the mix the user wants. The page confirms before it calls this. */
  setTargetAllocation: route({ method: "PATCH", path: "/v1/investments/targets", body: TargetAllocation, response: AllocationDrift }),
  /** What the Copilot has caught: checks, flags and what was at stake. */
  getCopilotImpact: route({ method: "GET", path: "/v1/copilot/impact", response: CopilotImpact }),
  /** Every credit card with its utilization, interest cost and dates, for the Credit page. */
  getCreditCards: route({ method: "GET", path: "/v1/credit/cards", response: CreditCardsOverview }),
  /** The quarter marks of each goal. */
  getGoalMilestones: route({ method: "GET", path: "/v1/goals/milestones", response: z.array(GoalMilestones) }),
  /** What was spent, earned or saved between two dates, optionally for one category or merchant. The same rules as the monthly summary. */
  getPeriodSummary: route({
    method: "GET",
    path: "/v1/spending/period",
    query: PeriodQuery,
    response: PeriodSummary,
  }),
  /** How a month's spending falls across days, weekdays and merchants. `month` defaults to the current one. */
  getSpendingPatterns: route({
    method: "GET",
    path: "/v1/spending/patterns",
    query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
    response: SpendingPatterns,
  }),
  /** Totals for the transactions with these ids. A POST only because the list of ids is too long for a URL; it changes nothing. */
  summarizeTransactions: route({
    method: "POST",
    path: "/v1/transactions/summary",
    body: TransactionSummaryRequest,
    response: TransactionSummary,
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
    query: z.object({
      limit: z.coerce.number().int().positive().max(50).default(10),
      /** "purchases" leaves out money moved to savings and investing and anything that repeats (rent, loans, subscriptions). */
      kind: z.enum(["all", "purchases"]).default("all"),
    }),
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
  /** Moves up to 200 transactions to one category. Every id is checked before any is changed. */
  bulkRecategorizeTransactions: route({ method: "POST", path: "/v1/transactions/bulk-category", body: BulkRecategorize, response: BulkRecategorized }),
  /** Splits one transaction into parts that add up to it. */
  splitTransaction: route({ method: "POST", path: "/v1/transactions/:id/split", body: SplitTransaction, response: z.array(Transaction) }),
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
