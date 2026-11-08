import type {
  Account,
  CopilotAction,
  CopilotEvent,
  EmailSchedule,
  EmailScheduleLogEntry,
  Goal,
  LifeEvent,
  NewAccount,
  NewGoal,
  QuarterlyReport,
  Recommendation,
  SimulationRun,
  Transaction,
  User,
} from "@finvantage/contracts";
import type { BankItemUpdate } from "./plaid/client";
import type { IncomeProfile } from "./profile";

/** A linked bank as the store keeps it. `transactionsCursor` is where the next sync starts. */
export interface BankItemRecord {
  itemId: string;
  institutionName: string;
  status: string;
  transactionsCursor: string | null;
  accountCount: number;
}

/** One of the bank's recurring streams (Plaid /transactions/recurring/get), outflows only. */
export interface RecurringStream {
  merchant: string;
  /** Positive: the usual amount paid. */
  amountCents: number;
  frequency: "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "ANNUALLY" | "UNKNOWN";
  predictedNextDate: string | null;
  accountId: string;
  /** Plaid's detailed category, such as "ENTERTAINMENT_TV_AND_MOVIES". */
  categoryDetailed: string | null;
}

/** Relational data. Memory by default; SpacetimeDB in production (spacetime/ledger.ts). */
export interface LedgerStore {
  getUser(userId: string): Promise<User | null>;
  saveUser(user: User): Promise<User>;
  getIncomeProfile(userId: string): Promise<IncomeProfile | null>;
  listAccounts(userId: string): Promise<Account[]>;
  createAccount(userId: string, account: NewAccount): Promise<Account>;
  updateAccount(userId: string, id: string, account: NewAccount): Promise<Account | null>;
  replaceAccounts(userId: string, accounts: Account[]): Promise<void>;
  listTransactions(userId: string, limit: number): Promise<Transaction[]>;
  addTransaction(transaction: Omit<Transaction, "id">): Promise<Transaction>;
  updateTransaction(userId: string, id: string, transaction: Omit<Transaction, "id">): Promise<Transaction | null>;
  listGoals(userId: string): Promise<Goal[]>;
  createGoal(userId: string, goal: NewGoal): Promise<Goal>;
  updateGoal(userId: string, id: string, goal: NewGoal): Promise<Goal | null>;
  deleteGoal(userId: string, id: string): Promise<boolean>;
  /** Clears the user's data and reloads the demo profile. */
  loadDemoProfile(userId: string): Promise<void>;
  /** Linked banks (Plaid Items). */
  listBankItems(userId: string): Promise<BankItemRecord[]>;
  /** Applies one sync's results to an item, creating the item on its first sync. */
  applyBankUpdate(userId: string, update: BankItemUpdate): Promise<void>;
  /** Removes a linked bank and everything under it. False if the user has no such item. */
  removeBankItem(userId: string, itemId: string): Promise<boolean>;
  /**
   * Active outgoing recurring streams across the user's banks. Optional: without it, the
   * Spending routes estimate recurring charges from transactions. TODO(platform): Spacetime.
   */
  listRecurringStreams?(userId: string): Promise<RecurringStream[]>;
}

/** Nested, variable-shape records. Backed by MongoDB Atlas. */
export interface DocumentStore {
  listLifeEvents(userId: string): Promise<LifeEvent[]>;
  saveLifeEvent(event: LifeEvent): Promise<LifeEvent>;
  saveSimulationRun(run: SimulationRun): Promise<SimulationRun>;
  getSimulationRun(userId: string, id: string): Promise<SimulationRun | null>;
  /** Newest first. */
  listSimulationRuns(userId: string, range?: TimeRange): Promise<SimulationRun[]>;
  saveCopilotEvent(event: CopilotEvent): Promise<CopilotEvent>;
  getCopilotEvent(userId: string, id: string): Promise<CopilotEvent | null>;
  setCopilotAction(userId: string, id: string, action: CopilotAction): Promise<CopilotEvent | null>;
  /** Newest first. */
  listCopilotEvents(userId: string, range?: TimeRange): Promise<CopilotEvent[]>;
  /** False when the user has no such event. */
  deleteCopilotEvent(userId: string, id: string): Promise<boolean>;
  /** Removes all of the user's Copilot events; returns how many. */
  clearCopilotEvents(userId: string): Promise<number>;
  saveRecommendation(recommendation: Recommendation): Promise<Recommendation>;
  /** Newest first. */
  listRecommendations(userId: string, range?: TimeRange): Promise<Recommendation[]>;
  saveReport(report: QuarterlyReport): Promise<QuarterlyReport>;
  /** A report's rendered PDF. Kept with the documents so any server instance can serve it. */
  saveReportPdf(userId: string, reportId: string, pdf: Buffer): Promise<void>;
  getReportPdf(userId: string, reportId: string): Promise<Buffer | null>;
  getReport(userId: string, id: string): Promise<QuarterlyReport | null>;
  getReportByQuarter(userId: string, quarter: string): Promise<QuarterlyReport | null>;
  updateReport(report: QuarterlyReport): Promise<QuarterlyReport>;
  /** Newest first. */
  listReports(userId: string): Promise<QuarterlyReport[]>;
  getEmailSchedule(userId: string): Promise<EmailSchedule | null>;
  saveEmailSchedule(userId: string, schedule: EmailSchedule): Promise<EmailSchedule>;
  claimNextDueEmailSchedule(
    now: string,
    leaseExpiresAt: string,
    attemptId: string,
  ): Promise<EmailSchedule | null>;
  recordEmailScheduleLog(userId: string, entry: EmailScheduleLogEntry): Promise<void>;
  listEmailScheduleLogs(userId: string, limit?: number): Promise<EmailScheduleLogEntry[]>;
}

/** Inclusive start, exclusive end. */
export interface TimeRange {
  start: string;
  end: string;
}
