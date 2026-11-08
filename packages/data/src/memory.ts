import { randomUUID } from "node:crypto";
import {
  EmailSchedule,
  type CopilotAction,
  type CopilotEvent,
  type EmailScheduleLogEntry,
  type Goal,
  type GoalStatus,
  type LifeEvent,
  type NewGoal,
  type QuarterlyReport,
  type Recommendation,
  type SimulationRun,
  Transaction,
  type User,
  type Account,
  type NewAccount,
} from "@finvantage/contracts";
import { DEMO_USER_ID, demoProfileFor, type IncomeProfile } from "./profile";
import type { DocumentStore, LedgerStore } from "./stores";

function inRange(createdAt: string, range?: { start: string; end: string }) {
  return !range || (createdAt >= range.start && createdAt < range.end);
}

/** A new or edited goal with no status gets one from its balance. Shared by every ledger store. */
export function goalStatusForBalance(goal: Pick<Goal, "currentCents" | "targetCents">): GoalStatus {
  if (goal.currentCents >= goal.targetCents) return "achieved";
  return goal.currentCents > 0 ? "in_progress" : "not_started";
}

/** Default store: the demo profile in memory, reset on restart. No database needed. */
export class MemoryLedgerStore implements LedgerStore {
  private users = new Map<string, User>();
  private incomes = new Map<string, IncomeProfile>();
  private accounts: Account[] = [];
  private transactions: Transaction[] = [];
  private goals: Goal[] = [];

  constructor() {
    this.seed(DEMO_USER_ID);
  }

  /** Replaces only this user's rows with their copy of the demo profile. */
  private seed(userId: string) {
    const profile = demoProfileFor(userId);
    const accountIds = new Set(this.accounts.filter((a) => a.userId === userId).map((a) => a.id));
    this.users.set(userId, profile.user);
    this.incomes.set(userId, profile.income);
    this.accounts = [...this.accounts.filter((a) => a.userId !== userId), ...profile.accounts];
    this.transactions = [
      ...this.transactions.filter((t) => !accountIds.has(t.accountId)),
      ...profile.transactions,
    ];
    this.goals = [...this.goals.filter((g) => g.userId !== userId), ...profile.goals];
  }

  async getUser(userId: string) {
    return this.users.get(userId) ?? null;
  }

  async saveUser(user: User) {
    this.users.set(user.id, user);
    return user;
  }

  async getIncomeProfile(userId: string) {
    return this.incomes.get(userId) ?? null;
  }

  async listAccounts(userId: string) {
    return this.accounts.filter((a) => a.userId === userId);
  }

  async createAccount(userId: string, account: NewAccount) {
    const saved: Account = { ...account, id: randomUUID(), userId };
    this.accounts.push(saved);
    return saved;
  }

  async updateAccount(userId: string, id: string, account: NewAccount) {
    const index = this.accounts.findIndex((item) => item.id === id && item.userId === userId);
    if (index < 0) return null;
    const updated: Account = { ...account, id, userId };
    this.accounts[index] = updated;
    return updated;
  }

  async replaceAccounts(userId: string, accounts: Account[]) {
    this.accounts = [...this.accounts.filter((a) => a.userId !== userId), ...accounts];
  }

  async listTransactions(userId: string, limit: number) {
    const ids = new Set((await this.listAccounts(userId)).map((a) => a.id));
    return this.transactions
      .filter((t) => ids.has(t.accountId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  async addTransaction(transaction: Omit<Transaction, "id">) {
    const saved: Transaction = Transaction.parse({
      ...transaction,
      id: randomUUID(),
    });
    this.transactions.push(saved);
    return saved;
  }

  async updateTransaction(userId: string, id: string, transaction: Omit<Transaction, "id">) {
    const account = this.accounts.find((item) => item.id === transaction.accountId && item.userId === userId);
    const index = this.transactions.findIndex((item) => item.id === id && this.accounts.some((a) => a.id === item.accountId && a.userId === userId));
    if (!account || index < 0) return null;
    const updated = { ...transaction, id };
    this.transactions[index] = updated;
    return updated;
  }

  async listGoals(userId: string) {
    return this.goals
      .filter((g) => g.userId === userId)
      .sort((a, b) => a.priorityRank - b.priorityRank);
  }

  async createGoal(userId: string, goal: NewGoal) {
    const saved: Goal = { ...goal, status: goal.status ?? goalStatusForBalance(goal), id: randomUUID(), userId };
    this.goals.push(saved);
    return saved;
  }

  async updateGoal(userId: string, id: string, goal: NewGoal) {
    const index = this.goals.findIndex((item) => item.id === id && item.userId === userId);
    if (index < 0) return null;
    const updated: Goal = { ...goal, status: goal.status ?? goalStatusForBalance(goal), id, userId };
    this.goals[index] = updated;
    return updated;
  }

  async deleteGoal(userId: string, id: string) {
    const index = this.goals.findIndex((item) => item.id === id && item.userId === userId);
    if (index < 0) return false;
    this.goals.splice(index, 1);
    return true;
  }

  async loadDemoProfile(userId: string) {
    this.seed(userId);
  }
}

export class MemoryDocumentStore implements DocumentStore {
  private lifeEvents: LifeEvent[] = [];
  private runs: SimulationRun[] = [];
  private copilotEvents: CopilotEvent[] = [];
  private recommendations: Recommendation[] = [];
  private reports: QuarterlyReport[] = [];

  async listLifeEvents(userId: string) {
    return this.lifeEvents.filter((e) => e.userId === userId);
  }

  async saveLifeEvent(event: LifeEvent) {
    this.lifeEvents.push(event);
    return event;
  }

  async saveSimulationRun(run: SimulationRun) {
    this.runs.unshift(run);
    return run;
  }

  async getSimulationRun(userId: string, id: string) {
    return this.runs.find((r) => r.userId === userId && r.id === id) ?? null;
  }

  async listSimulationRuns(userId: string, range?: { start: string; end: string }) {
    return this.runs.filter((r) => r.userId === userId && inRange(r.createdAt, range));
  }

  async saveCopilotEvent(event: CopilotEvent) {
    this.copilotEvents.unshift(event);
    return event;
  }

  async getCopilotEvent(userId: string, id: string) {
    return this.copilotEvents.find((e) => e.userId === userId && e.id === id) ?? null;
  }

  async setCopilotAction(userId: string, id: string, action: CopilotAction) {
    const event = await this.getCopilotEvent(userId, id);
    if (event) event.userAction = action;
    return event;
  }

  async listCopilotEvents(userId: string, range?: { start: string; end: string }) {
    return this.copilotEvents.filter((e) => e.userId === userId && inRange(e.createdAt, range));
  }

  async saveRecommendation(recommendation: Recommendation) {
    this.recommendations.unshift(recommendation);
    return recommendation;
  }

  async listRecommendations(userId: string, range?: { start: string; end: string }) {
    return this.recommendations.filter(
      (recommendation) =>
        recommendation.userId === userId && inRange(recommendation.createdAt, range),
    );
  }

  async saveReport(report: QuarterlyReport) {
    const existing = this.reports.findIndex(
      (candidate) => candidate.userId === report.userId && candidate.quarter === report.quarter,
    );
    if (existing >= 0) this.reports.splice(existing, 1);
    this.reports.unshift(report);
    return report;
  }

  async getReport(userId: string, id: string) {
    return this.reports.find((report) => report.userId === userId && report.id === id) ?? null;
  }

  async getReportByQuarter(userId: string, quarter: string) {
    return (
      this.reports.find((report) => report.userId === userId && report.quarter === quarter) ?? null
    );
  }

  async updateReport(report: QuarterlyReport) {
    return this.saveReport(report);
  }

  async listReports(userId: string) {
    return this.reports.filter((r) => r.userId === userId);
  }

  private emailSchedules = new Map<string, EmailSchedule>();
  private emailScheduleLogs: EmailScheduleLogEntry[] = [];

  async getEmailSchedule(userId: string) {
    return this.emailSchedules.get(userId) ?? null;
  }

  async saveEmailSchedule(userId: string, schedule: EmailSchedule) {
    this.emailSchedules.set(userId, schedule);
    return schedule;
  }

  async claimNextDueEmailSchedule(now: string, leaseExpiresAt: string, attemptId: string) {
    const due = [...this.emailSchedules.values()]
      .filter(
        (schedule) =>
          schedule.enabled &&
          schedule.nextScheduledAt !== null &&
          schedule.nextScheduledAt <= now &&
          (schedule.leaseExpiresAt === null || schedule.leaseExpiresAt <= now),
      )
      .sort((left, right) =>
        (left.nextScheduledAt ?? "").localeCompare(right.nextScheduledAt ?? ""),
      )[0];
    if (!due) return null;
    const claimed = EmailSchedule.parse({
      ...due,
      lastStatus: "pending",
      lastError: null,
      leaseExpiresAt,
      activeAttemptId: attemptId,
      updatedAt: now,
    });
    this.emailSchedules.set(claimed.userId, claimed);
    return claimed;
  }

  async recordEmailScheduleLog(userId: string, entry: EmailScheduleLogEntry) {
    this.emailScheduleLogs.unshift(entry);
  }

  async listEmailScheduleLogs(userId: string, limit = 20) {
    return this.emailScheduleLogs.filter((l) => l.userId === userId).slice(0, limit);
  }
}
