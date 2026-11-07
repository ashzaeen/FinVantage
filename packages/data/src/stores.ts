import type {
  Account,
  CopilotAction,
  CopilotEvent,
  Goal,
  LifeEvent,
  NewGoal,
  NewTransaction,
  QuarterlyReport,
  Recommendation,
  SimulationRun,
  Transaction,
  User,
} from "@finvantage/contracts";
import type { IncomeProfile } from "./profile";

/** Relational data. Backed by Tiger Data Postgres. See tiger/schema.sql. */
export interface LedgerStore {
  getUser(userId: string): Promise<User | null>;
  saveUser(user: User): Promise<User>;
  getIncomeProfile(userId: string): Promise<IncomeProfile | null>;
  listAccounts(userId: string): Promise<Account[]>;
  replaceAccounts(userId: string, accounts: Account[]): Promise<void>;
  listTransactions(userId: string, limit: number): Promise<Transaction[]>;
  addTransaction(transaction: NewTransaction): Promise<Transaction>;
  listGoals(userId: string): Promise<Goal[]>;
  createGoal(userId: string, goal: NewGoal): Promise<Goal>;
  /** Clears the user's data and reloads the demo profile. */
  loadDemoProfile(userId: string): Promise<void>;
}

/** Nested, variable-shape records. Backed by MongoDB Atlas. */
export interface DocumentStore {
  listLifeEvents(userId: string): Promise<LifeEvent[]>;
  saveLifeEvent(event: LifeEvent): Promise<LifeEvent>;
  saveSimulationRun(run: SimulationRun): Promise<SimulationRun>;
  getSimulationRun(userId: string, id: string): Promise<SimulationRun | null>;
  /** Newest first. */
  listSimulationRuns(userId: string): Promise<SimulationRun[]>;
  saveCopilotEvent(event: CopilotEvent): Promise<CopilotEvent>;
  getCopilotEvent(userId: string, id: string): Promise<CopilotEvent | null>;
  setCopilotAction(userId: string, id: string, action: CopilotAction): Promise<CopilotEvent | null>;
  /** Newest first. */
  listCopilotEvents(userId: string): Promise<CopilotEvent[]>;
  saveRecommendation(recommendation: Recommendation): Promise<Recommendation>;
  saveReport(report: QuarterlyReport): Promise<QuarterlyReport>;
  /** Newest first. */
  listReports(userId: string): Promise<QuarterlyReport[]>;
}
