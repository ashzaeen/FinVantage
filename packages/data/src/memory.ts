import { randomUUID } from "node:crypto";
import {
  EmailSchedule,
  type AdvisorConversation,
  type AdvisorMessage,
  type CopilotAction,
  type CopilotEvent,
  type EmailScheduleLogEntry,
  type Goal,
  type GoalStatus,
  type LifeEvent,
  type LifeScenario,
  type NewGoal,
  type QuarterlyReport,
  type Recommendation,
  type SimulationRun,
  Transaction,
  type User,
  type Account,
  type NewAccount,
} from "@finvantage/contracts";
import type { BankItemUpdate } from "./plaid/client";
import { mapItemSnapshot, toCents, type AccountDetails } from "./plaid/map";
import type { PlaidItemSnapshot } from "./plaid/schema";
import { DEMO_USER_ID, demoProfileFor, demoSourceFor, type IncomeProfile } from "./profile";
import type { BankItemRecord, DocumentStore, LedgerStore, RecurringStream } from "./stores";

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
  /** Linked banks, kept in Plaid's shape and mapped on read, like the Spacetime store. */
  private bankItems = new Map<string, { userId: string; snapshot: PlaidItemSnapshot }>();
  /** Users whose data came from the demo profile, which carries its own bank snapshots. */
  private demoUsers = new Set<string>();
  /** Terms the user set on bank-linked accounts. */
  private bankDetails = new Map<string, AccountDetails>();

  constructor() {
    this.seed(DEMO_USER_ID);
  }

  /** Replaces only this user's rows with their copy of the demo profile. */
  private seed(userId: string) {
    const profile = demoProfileFor(userId);
    this.demoUsers.add(userId);
    const accountIds = new Set(this.accounts.filter((a) => a.userId === userId).map((a) => a.id));
    this.users.set(userId, profile.user);
    this.incomes.set(userId, profile.income);
    this.accounts = [...this.accounts.filter((a) => a.userId !== userId), ...profile.accounts];
    this.transactions = [
      ...this.transactions.filter((t) => !accountIds.has(t.accountId)),
      ...profile.transactions,
    ];
    this.goals = [...this.goals.filter((g) => g.userId !== userId), ...profile.goals];
    for (const [itemId, item] of this.bankItems) if (item.userId === userId) this.bankItems.delete(itemId);
  }

  private bank(userId: string) {
    const details = Object.fromEntries(this.bankDetails);
    return [...this.bankItems.values()]
      .filter((item) => item.userId === userId)
      .map((item) => mapItemSnapshot(item.snapshot, userId, details));
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
    return [...this.accounts.filter((a) => a.userId === userId), ...this.bank(userId).flatMap((b) => b.accounts)];
  }

  async createAccount(userId: string, account: NewAccount) {
    const saved: Account = { ...account, id: randomUUID(), userId };
    this.accounts.push(saved);
    return saved;
  }

  async updateAccount(userId: string, id: string, account: NewAccount) {
    const index = this.accounts.findIndex((item) => item.id === id && item.userId === userId);
    if (index < 0) {
      // A bank-linked account: only its terms can change. The bank owns the rest.
      if (!this.bank(userId).some((b) => b.accounts.some((a) => a.id === id))) return null;
      this.bankDetails.set(id, {
        annualRate: account.annualRate,
        minimumPaymentCents: account.minimumPaymentCents,
        promoRateEndsOn: account.promoRateEndsOn,
      });
      return (await this.listAccounts(userId)).find((a) => a.id === id) ?? null;
    }
    const updated: Account = { ...account, id, userId };
    this.accounts[index] = updated;
    return updated;
  }

  async replaceAccounts(userId: string, accounts: Account[]) {
    this.accounts = [...this.accounts.filter((a) => a.userId !== userId), ...accounts];
  }

  async listTransactions(userId: string, limit: number) {
    const ids = new Set((await this.listAccounts(userId)).map((a) => a.id));
    // Bank transactions first, then the user's own: an edit of a bank transaction has its id and wins.
    const byId = new Map(this.bank(userId).flatMap((b) => b.transactions).map((t) => [t.id, t]));
    for (const t of this.transactions) if (ids.has(t.accountId)) byId.set(t.id, t);
    return [...byId.values()]
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
    const accounts = await this.listAccounts(userId);
    const current = await this.listTransactions(userId, Number.MAX_SAFE_INTEGER);
    if (!accounts.some((a) => a.id === transaction.accountId) || !current.some((t) => t.id === id)) return null;
    const updated = Transaction.parse({ ...transaction, id });
    const index = this.transactions.findIndex((item) => item.id === id);
    if (index >= 0) this.transactions[index] = updated;
    else this.transactions.push(updated);
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

  async listRecurringStreams(userId: string): Promise<RecurringStream[]> {
    const linked = [...this.bankItems.values()].filter((item) => item.userId === userId).map((item) => item.snapshot);
    const demo = this.demoUsers.has(userId) ? demoSourceFor(userId).bank : [];
    return [...demo, ...linked]
      .flatMap((snapshot) => snapshot.recurring?.outflow_streams ?? [])
      .filter((stream) => stream.is_active)
      .map((stream) => ({
        merchant: stream.merchant_name ?? stream.description,
        amountCents: Math.abs(toCents(stream.average_amount.amount)),
        frequency: stream.frequency,
        predictedNextDate: stream.predicted_next_date ?? null,
        accountId: stream.account_id,
        categoryDetailed: stream.personal_finance_category?.detailed ?? null,
      }));
  }

  async listBankItems(userId: string): Promise<BankItemRecord[]> {
    return [...this.bankItems.values()]
      .filter((item) => item.userId === userId)
      .map(({ snapshot }) => ({
        itemId: snapshot.item.item_id,
        institutionName: snapshot.item.institution_name,
        status: "good",
        transactionsCursor: snapshot.transactions_cursor,
        accountCount: mapItemSnapshot(snapshot, userId).accounts.length,
      }));
  }

  async applyBankUpdate(userId: string, update: BankItemUpdate) {
    const existing = this.bankItems.get(update.item.item_id);
    if (existing && existing.userId !== userId) throw new Error(`Item ${update.item.item_id} belongs to another user.`);
    const accountIds = new Set(update.accounts.map((a) => a.account_id));
    const transactions = new Map((existing?.snapshot.transactions ?? []).map((t) => [t.transaction_id, t]));
    for (const t of [...update.added, ...update.modified]) transactions.set(t.transaction_id, t);
    for (const id of update.removedTransactionIds) {
      transactions.delete(id);
      this.transactions = this.transactions.filter((t) => t.id !== id);
    }
    this.bankItems.set(update.item.item_id, {
      userId,
      snapshot: {
        item: update.item,
        accounts: update.accounts,
        transactions: [...transactions.values()].filter((t) => accountIds.has(t.account_id)),
        transactions_cursor: update.nextCursor,
        liabilities: update.liabilities,
        recurring: update.recurring,
        investments: update.investments,
      },
    });
  }

  async removeBankItem(userId: string, itemId: string) {
    const item = this.bankItems.get(itemId);
    if (!item || item.userId !== userId) return false;
    const accountIds = new Set(item.snapshot.accounts.map((a) => a.account_id));
    this.transactions = this.transactions.filter((t) => !accountIds.has(t.accountId));
    for (const id of accountIds) this.bankDetails.delete(id);
    this.bankItems.delete(itemId);
    return true;
  }
}

export class MemoryDocumentStore implements DocumentStore {
  private lifeEvents: LifeEvent[] = [];
  private lifeScenarios: LifeScenario[] = [];
  private runs: SimulationRun[] = [];
  private copilotEvents: CopilotEvent[] = [];
  private recommendations: Recommendation[] = [];
  private reports: QuarterlyReport[] = [];
  private conversations: AdvisorConversation[] = [];
  private advisorMessages: Array<AdvisorMessage & { userId: string }> = [];

  async listLifeEvents(userId: string) {
    return this.lifeEvents.filter((e) => e.userId === userId);
  }

  async saveLifeEvent(event: LifeEvent) {
    this.lifeEvents.push(event);
    return event;
  }

  async deleteLifeEvent(userId: string, id: string) {
    const index = this.lifeEvents.findIndex((e) => e.userId === userId && e.id === id);
    if (index < 0) return false;
    this.lifeEvents.splice(index, 1);
    return true;
  }

  async listLifeScenarios(userId: string) {
    return this.lifeScenarios.filter((s) => s.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveLifeScenario(scenario: LifeScenario) {
    const index = this.lifeScenarios.findIndex((s) => s.id === scenario.id && s.userId === scenario.userId);
    if (index >= 0) this.lifeScenarios[index] = scenario;
    else this.lifeScenarios.push(scenario);
    return scenario;
  }

  async getLifeScenario(userId: string, id: string) {
    return this.lifeScenarios.find((s) => s.userId === userId && s.id === id) ?? null;
  }

  async deleteLifeScenario(userId: string, id: string) {
    const index = this.lifeScenarios.findIndex((s) => s.userId === userId && s.id === id);
    if (index < 0) return false;
    this.lifeScenarios.splice(index, 1);
    return true;
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

  async deleteCopilotEvent(userId: string, id: string) {
    const before = this.copilotEvents.length;
    this.copilotEvents = this.copilotEvents.filter((e) => !(e.userId === userId && e.id === id));
    return this.copilotEvents.length < before;
  }

  async clearCopilotEvents(userId: string) {
    const before = this.copilotEvents.length;
    this.copilotEvents = this.copilotEvents.filter((e) => e.userId !== userId);
    return before - this.copilotEvents.length;
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

  async saveAdvisorConversation(conversation: AdvisorConversation) {
    this.conversations = [
      conversation,
      ...this.conversations.filter((c) => !(c.userId === conversation.userId && c.id === conversation.id)),
    ];
    return conversation;
  }

  async getAdvisorConversation(userId: string, id: string) {
    return this.conversations.find((c) => c.userId === userId && c.id === id) ?? null;
  }

  async listAdvisorConversations(userId: string) {
    return this.conversations
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteAdvisorConversation(userId: string, id: string) {
    const before = this.conversations.length;
    this.conversations = this.conversations.filter((c) => !(c.userId === userId && c.id === id));
    this.advisorMessages = this.advisorMessages.filter((m) => !(m.userId === userId && m.conversationId === id));
    return this.conversations.length < before;
  }

  async appendAdvisorMessage(userId: string, message: AdvisorMessage) {
    this.advisorMessages.push({ ...message, userId });
    return message;
  }

  async listAdvisorMessages(userId: string, conversationId: string) {
    return this.advisorMessages
      .filter((m) => m.userId === userId && m.conversationId === conversationId)
      .map(({ userId: _owner, ...message }) => message);
  }

  private reportPdfs = new Map<string, Buffer>();

  async saveReportPdf(userId: string, reportId: string, pdf: Buffer) {
    this.reportPdfs.set(`${userId}:${reportId}`, Buffer.from(pdf));
  }

  async getReportPdf(userId: string, reportId: string) {
    return this.reportPdfs.get(`${userId}:${reportId}`) ?? null;
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
