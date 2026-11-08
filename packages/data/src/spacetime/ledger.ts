/**
 * LedgerStore on SpacetimeDB (Maincloud), over the HTTP API. Selected with LEDGER_BACKEND=spacetime.
 *
 * Reads rebuild Plaid snapshots from the bank tables and run them through mapItemSnapshot, the
 * same path the demo fixture and real Plaid data take. Then the user's own data is layered on:
 * - `app_account`: accounts entered by hand.
 * - `app_transaction`: transactions entered by hand, or the user's edit of a bank transaction
 *   (same id, and it wins over the bank's version).
 * - `account_detail`: terms for bank accounts that the bank doesn't report.
 *
 * Editing a bank-linked account only changes its terms (rate, minimum payment, promo end date).
 * Its name, type, and balances come from the bank. Writes go through the module's admin-only
 * reducers. Each query is its own request, so independent reads run in parallel.
 */
import { randomUUID } from "node:crypto";
import {
  Account,
  Goal,
  Transaction,
  User,
  type NewAccount,
  type NewGoal,
} from "@finvantage/contracts";
import { goalStatusForBalance } from "../memory";
import { AccountDetails, mapItemSnapshot } from "../plaid/map";
import type { PlaidItemSnapshot } from "../plaid/schema";
import type { BankItemUpdate } from "../plaid/client";
import { bankItemLoad, loadProfileArgs, opt, toWire } from "../plaid/spacetime-rows";
import { demoSourceFor, IncomeProfile } from "../profile";
import type { BankItemRecord, LedgerStore } from "../stores";
import { SpacetimeHttp, sqlString, type SpacetimeConfig } from "./client";

// Row shapes as decoded by SpacetimeHttp.sql (camelCase, null for none).
interface UserRow { id: string; displayName: string; email: string | null; bufferTargetCents: number; extensionEnabled: boolean; snoozedSites: string[] }
interface ItemRow { itemId: string; institutionId: string | null; institutionName: string; transactionsCursor: string | null }
interface BankAccountRow { accountId: string; itemId: string; name: string; officialName: string | null; mask: string | null; type: string; subtype: string | null; currentCents: number | null; availableCents: number | null; limitCents: number | null; isoCurrencyCode: string | null }
interface BankTransactionRow { transactionId: string; accountId: string; amountCents: number; isoCurrencyCode: string | null; date: string; authorizedDate: string | null; name: string; merchantName: string | null; merchantEntityId: string | null; logoUrl: string | null; website: string | null; paymentChannel: string; pending: boolean; pendingTransactionId: string | null; pfcPrimary: string | null; pfcDetailed: string | null; pfcConfidence: string | null }
interface LiabilityRow { accountId: string; kind: string; aprs: { aprPercentage: number; aprType: string }[]; interestRatePercentage: number | null; minimumPaymentCents: number | null; nextPaymentDueDate: string | null; lastPaymentAmountCents: number | null; lastPaymentDate: string | null; lastStatementBalanceCents: number | null; isOverdue: boolean | null; originationDate: string | null; maturityDate: string | null; originationPrincipalCents: number | null; expectedPayoffDate: string | null }
interface StreamRow { streamId: string; accountId: string; direction: string; description: string; merchantName: string | null; firstDate: string; lastDate: string; predictedNextDate: string | null; frequency: string; transactionIds: string[]; averageAmountCents: number; lastAmountCents: number; isActive: boolean; status: string; pfcPrimary: string | null; pfcDetailed: string | null }
interface DetailRow { accountId: string; annualRate: number | null; minimumPaymentCents: number | null; promoRateEndsOn: string | null }
type AppAccountRow = Omit<Account, never>;
type AppTransactionRow = Transaction & { userId: string };
type GoalRow = Omit<Goal, "status"> & { status: string | null };

const dollars = (cents: number | null) => (cents === null ? null : cents / 100);
const pfc = (primary: string | null, detailed: string | null, confidence: string | null = null) =>
  primary && detailed ? { primary, detailed, confidence_level: confidence } : null;

interface BankRows {
  items: ItemRow[];
  accounts: BankAccountRow[];
  transactions: BankTransactionRow[];
  liabilities: LiabilityRow[];
  streams: StreamRow[];
}

/** Bank tables back into Plaid snapshots, so mapItemSnapshot can do the conversion. */
function snapshotsFromRows(rows: BankRows): PlaidItemSnapshot[] {
  return rows.items.map((item) => {
    const accounts = rows.accounts.filter((a) => a.itemId === item.itemId);
    const ids = new Set(accounts.map((a) => a.accountId));
    const liabilities = rows.liabilities.filter((l) => ids.has(l.accountId));
    const streams = rows.streams.filter((s) => ids.has(s.accountId));
    const stream = (s: StreamRow) => ({
      stream_id: s.streamId,
      account_id: s.accountId,
      description: s.description,
      merchant_name: s.merchantName,
      first_date: s.firstDate,
      last_date: s.lastDate,
      predicted_next_date: s.predictedNextDate,
      frequency: s.frequency as PlaidItemSnapshot["recurring"]["inflow_streams"][number]["frequency"],
      transaction_ids: s.transactionIds,
      average_amount: { amount: s.averageAmountCents / 100, iso_currency_code: null },
      last_amount: { amount: s.lastAmountCents / 100, iso_currency_code: null },
      is_active: s.isActive,
      status: s.status as PlaidItemSnapshot["recurring"]["inflow_streams"][number]["status"],
      personal_finance_category: pfc(s.pfcPrimary, s.pfcDetailed),
    });
    return {
      item: { item_id: item.itemId, institution_id: item.institutionId, institution_name: item.institutionName },
      accounts: accounts.map((a) => ({
        account_id: a.accountId,
        balances: {
          available: dollars(a.availableCents),
          current: dollars(a.currentCents),
          limit: dollars(a.limitCents),
          iso_currency_code: a.isoCurrencyCode,
        },
        mask: a.mask,
        name: a.name,
        official_name: a.officialName,
        type: a.type as PlaidItemSnapshot["accounts"][number]["type"],
        subtype: a.subtype,
      })),
      transactions: rows.transactions
        .filter((t) => ids.has(t.accountId))
        .map((t) => ({
          transaction_id: t.transactionId,
          account_id: t.accountId,
          amount: t.amountCents / 100,
          iso_currency_code: t.isoCurrencyCode,
          date: t.date,
          authorized_date: t.authorizedDate,
          name: t.name,
          merchant_name: t.merchantName,
          merchant_entity_id: t.merchantEntityId,
          logo_url: t.logoUrl,
          website: t.website,
          payment_channel: t.paymentChannel as "online" | "in store" | "other",
          pending: t.pending,
          pending_transaction_id: t.pendingTransactionId,
          personal_finance_category: pfc(t.pfcPrimary, t.pfcDetailed, t.pfcConfidence),
        })),
      transactions_cursor: item.transactionsCursor,
      liabilities: {
        credit: liabilities
          .filter((l) => l.kind === "credit")
          .map((l) => ({
            account_id: l.accountId,
            aprs: l.aprs.map((a) => ({
              apr_percentage: a.aprPercentage,
              apr_type: a.aprType,
            })),
            is_overdue: l.isOverdue,
            last_payment_amount: dollars(l.lastPaymentAmountCents),
            last_payment_date: l.lastPaymentDate,
            last_statement_balance: dollars(l.lastStatementBalanceCents),
            minimum_payment_amount: dollars(l.minimumPaymentCents),
            next_payment_due_date: l.nextPaymentDueDate,
          })),
        mortgage: liabilities
          .filter((l) => l.kind === "mortgage")
          .map((l) => ({
            account_id: l.accountId,
            interest_rate: { percentage: l.interestRatePercentage, type: null },
            next_monthly_payment: dollars(l.minimumPaymentCents),
            next_payment_due_date: l.nextPaymentDueDate,
            origination_date: l.originationDate,
            maturity_date: l.maturityDate,
            origination_principal_amount: dollars(l.originationPrincipalCents),
          })),
        student: liabilities
          .filter((l) => l.kind === "student")
          .map((l) => ({
            account_id: l.accountId,
            interest_rate_percentage: l.interestRatePercentage,
            minimum_payment_amount: dollars(l.minimumPaymentCents),
            next_payment_due_date: l.nextPaymentDueDate,
            expected_payoff_date: l.expectedPayoffDate,
          })),
      },
      recurring: {
        inflow_streams: streams.filter((s) => s.direction === "inflow").map(stream),
        outflow_streams: streams.filter((s) => s.direction === "outflow").map(stream),
      },
      investments: { holdings: [], securities: [] },
    };
  });
}

const accountWire = (a: Account) =>
  toWire({
    id: a.id,
    userId: a.userId,
    type: a.type,
    loanKind: opt(a.loanKind),
    name: a.name,
    institution: a.institution,
    balanceCents: a.balanceCents,
    annualRate: opt(a.annualRate),
    minimumPaymentCents: opt(a.minimumPaymentCents),
    promoRateEndsOn: opt(a.promoRateEndsOn),
    subtype: opt(a.subtype),
    mask: opt(a.mask),
    availableBalanceCents: opt(a.availableBalanceCents),
    creditLimitCents: opt(a.creditLimitCents),
    nextPaymentDueOn: opt(a.nextPaymentDueOn),
  });

const transactionWire = (t: Transaction, userId: string) =>
  toWire({
    id: t.id,
    userId,
    accountId: t.accountId,
    date: t.date,
    amountCents: t.amountCents,
    currency: t.currency,
    originalAmountCents: opt(t.originalAmountCents),
    exchangeRateToUsd: opt(t.exchangeRateToUsd),
    exchangeRateDate: opt(t.exchangeRateDate),
    merchant: t.merchant,
    category: opt(t.category),
    isRecurring: t.isRecurring,
    pending: t.pending,
    categoryDetailed: opt(t.categoryDetailed),
    paymentChannel: opt(t.paymentChannel),
    logoUrl: opt(t.logoUrl),
  });

const goalWire = (g: Goal) =>
  toWire({
    id: g.id,
    userId: g.userId,
    name: g.name,
    targetCents: g.targetCents,
    currentCents: g.currentCents,
    targetDate: g.targetDate,
    priorityRank: g.priorityRank,
    flexibility: g.flexibility,
    linkedAccountId: opt(g.linkedAccountId),
    status: opt(g.status),
  });

export class SpacetimeLedgerStore implements LedgerStore {
  private readonly db: SpacetimeHttp;

  constructor(config: SpacetimeConfig, fetchImpl: typeof fetch = fetch) {
    this.db = new SpacetimeHttp(config, fetchImpl);
  }

  private byUser<T>(table: string, userId: string, extra = "") {
    return this.db.sql<T>(`SELECT * FROM ${table} WHERE user_id = ${sqlString(userId)}${extra}`);
  }

  private async bankRows(userId: string, withTransactions: boolean): Promise<BankRows> {
    const [items, accounts, transactions, liabilities, streams] = await Promise.all([
      this.byUser<ItemRow>("bank_item", userId),
      this.byUser<BankAccountRow>("bank_account", userId),
      withTransactions ? this.byUser<BankTransactionRow>("bank_transaction", userId) : Promise.resolve([]),
      this.byUser<LiabilityRow>("liability", userId),
      withTransactions ? this.byUser<StreamRow>("recurring_stream", userId) : Promise.resolve([]),
    ]);
    return { items, accounts, transactions, liabilities, streams };
  }

  async getUser(userId: string) {
    const [row] = await this.db.sql<UserRow>(`SELECT * FROM app_user WHERE id = ${sqlString(userId)}`);
    if (!row) return null;
    return User.parse({
      id: row.id,
      displayName: row.displayName,
      email: row.email,
      preferences: { bufferTargetCents: row.bufferTargetCents },
      extensionSettings: { enabled: row.extensionEnabled, snoozedSites: row.snoozedSites },
    });
  }

  async saveUser(user: User) {
    await this.db.call("save_user", [
      toWire({
        id: user.id,
        displayName: user.displayName,
        email: opt(user.email),
        bufferTargetCents: user.preferences.bufferTargetCents,
        extensionEnabled: user.extensionSettings.enabled,
        snoozedSites: user.extensionSettings.snoozedSites,
      }),
    ]);
    return user;
  }

  async getIncomeProfile(userId: string) {
    const [row] = await this.byUser<IncomeProfile & { userId: string }>("income_profile", userId);
    if (!row) return null;
    const { userId: _userId, ...income } = row;
    return IncomeProfile.parse(income);
  }

  async listAccounts(userId: string) {
    const [bank, details, manual] = await Promise.all([
      this.bankRows(userId, false),
      this.byUser<DetailRow>("account_detail", userId),
      this.byUser<AppAccountRow>("app_account", userId),
    ]);
    const detailMap = Object.fromEntries(
      details.map((d) => [d.accountId, AccountDetails.parse({ annualRate: d.annualRate, minimumPaymentCents: d.minimumPaymentCents, promoRateEndsOn: d.promoRateEndsOn })]),
    );
    const linked = snapshotsFromRows(bank).flatMap((s) => mapItemSnapshot(s, userId, detailMap).accounts);
    return [...linked, ...manual.map((a) => Account.parse({ ...a, userId }))];
  }

  async createAccount(userId: string, account: NewAccount) {
    const saved = Account.parse({ ...account, id: randomUUID(), userId });
    await this.db.call("save_app_account", [accountWire(saved)]);
    return saved;
  }

  async updateAccount(userId: string, id: string, account: NewAccount) {
    const [manual] = await this.db.sql<AppAccountRow>(
      `SELECT * FROM app_account WHERE id = ${sqlString(id)} AND user_id = ${sqlString(userId)}`,
    );
    if (manual) {
      const updated = Account.parse({ ...account, id, userId });
      await this.db.call("save_app_account", [accountWire(updated)]);
      return updated;
    }
    const [linked] = await this.db.sql<BankAccountRow>(
      `SELECT * FROM bank_account WHERE account_id = ${sqlString(id)} AND user_id = ${sqlString(userId)}`,
    );
    if (!linked) return null;
    // The bank owns name, type, and balances. The user can set the terms it doesn't report.
    await this.db.call("save_account_detail", [
      toWire({
        accountId: id,
        userId,
        annualRate: opt(account.annualRate),
        minimumPaymentCents: opt(account.minimumPaymentCents),
        promoRateEndsOn: opt(account.promoRateEndsOn),
      }),
    ]);
    return (await this.listAccounts(userId)).find((a) => a.id === id) ?? null;
  }

  async replaceAccounts(userId: string, accounts: Account[]) {
    await this.db.call("replace_app_accounts", [userId, accounts.map((a) => accountWire({ ...a, userId }))]);
  }

  async listTransactions(userId: string, limit: number) {
    const [bank, edits, manualAccounts] = await Promise.all([
      this.bankRows(userId, true),
      this.byUser<AppTransactionRow>("app_transaction", userId),
      this.byUser<AppAccountRow>("app_account", userId),
    ]);
    const mapped = snapshotsFromRows(bank).flatMap((s) => mapItemSnapshot(s, userId));
    const known = new Set([...mapped.flatMap((m) => m.accounts.map((a) => a.id)), ...manualAccounts.map((a) => a.id)]);
    const byId = new Map(mapped.flatMap((m) => m.transactions).map((t) => [t.id, t]));
    for (const edit of edits) {
      const { userId: _userId, ...transaction } = edit;
      byId.set(edit.id, Transaction.parse(transaction));
    }
    return [...byId.values()]
      .filter((t) => known.has(t.accountId))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }

  async addTransaction(transaction: Omit<Transaction, "id">) {
    const saved = Transaction.parse({ ...transaction, id: randomUUID() });
    // The reducer finds the owner from the account and fails if there is none.
    await this.db.call("save_app_transaction", [transactionWire(saved, "")]);
    return saved;
  }

  async updateTransaction(userId: string, id: string, transaction: Omit<Transaction, "id">) {
    const current = await this.listTransactions(userId, Number.MAX_SAFE_INTEGER);
    const accounts = await this.listAccounts(userId);
    if (!current.some((t) => t.id === id) || !accounts.some((a) => a.id === transaction.accountId)) return null;
    const updated = Transaction.parse({ ...transaction, id });
    await this.db.call("save_app_transaction", [transactionWire(updated, userId)]);
    return updated;
  }

  async listGoals(userId: string) {
    const rows = await this.byUser<GoalRow>("goal", userId);
    return rows
      .map(({ status, ...goal }) => Goal.parse(status === null ? goal : { ...goal, status }))
      .sort((a, b) => a.priorityRank - b.priorityRank);
  }

  async createGoal(userId: string, goal: NewGoal) {
    const saved = Goal.parse({ ...goal, status: goal.status ?? goalStatusForBalance(goal), id: randomUUID(), userId });
    await this.db.call("save_goal", [goalWire(saved)]);
    return saved;
  }

  async updateGoal(userId: string, id: string, goal: NewGoal) {
    if (!(await this.listGoals(userId)).some((g) => g.id === id)) return null;
    const updated = Goal.parse({ ...goal, status: goal.status ?? goalStatusForBalance(goal), id, userId });
    await this.db.call("save_goal", [goalWire(updated)]);
    return updated;
  }

  async deleteGoal(userId: string, id: string) {
    if (!(await this.listGoals(userId)).some((g) => g.id === id)) return false;
    await this.db.call("delete_goal", [userId, id]);
    return true;
  }

  async loadDemoProfile(userId: string) {
    await this.db.call("load_profile", loadProfileArgs(demoSourceFor(userId)));
  }

  async listBankItems(userId: string): Promise<BankItemRecord[]> {
    const [items, accounts] = await Promise.all([
      this.byUser<ItemRow & { status: string }>("bank_item", userId),
      this.byUser<BankAccountRow>("bank_account", userId),
    ]);
    // The demo profile's built-in banks aren't linked banks: they have no token and can't sync.
    return items.filter((item) => item.status !== "demo").map((item) => ({
      itemId: item.itemId,
      institutionName: item.institutionName,
      status: item.status,
      transactionsCursor: item.transactionsCursor,
      accountCount: accounts.filter((a) => a.itemId === item.itemId).length,
    }));
  }

  async applyBankUpdate(userId: string, update: BankItemUpdate) {
    // Reuse the Plaid-to-row conversion by treating the update as a snapshot of upserts.
    const rows = bankItemLoad(
      {
        item: update.item,
        accounts: update.accounts,
        transactions: [...update.added, ...update.modified],
        transactions_cursor: update.nextCursor,
        liabilities: update.liabilities,
        recurring: update.recurring,
        investments: update.investments,
      },
      userId,
    );
    await this.db.call(
      "apply_bank_update",
      toWire([
        userId,
        rows.item,
        rows.accounts,
        rows.transactions,
        update.removedTransactionIds,
        rows.liabilities,
        rows.streams,
        rows.securities,
        rows.holdings,
      ]) as unknown[],
    );
  }

  async removeBankItem(userId: string, itemId: string) {
    const [item] = await this.db.sql<ItemRow>(
      `SELECT * FROM bank_item WHERE item_id = ${sqlString(itemId)} AND user_id = ${sqlString(userId)}`,
    );
    if (!item) return false;
    await this.db.call("remove_bank_item", [itemId]);
    return true;
  }
}
