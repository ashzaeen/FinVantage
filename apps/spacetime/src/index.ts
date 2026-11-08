/**
 * FinVantage's SpacetimeDB module. Three groups of tables (see docs/DATA-MODEL.md):
 *
 * 1. Bank data, mirroring Plaid's objects: bank_item, bank_account, bank_transaction, liability,
 *    recurring_stream, security, holding. Field names follow Plaid's, in camelCase here and
 *    snake_case on the wire. Plaid's dollars are stored as integer cents, but signs are kept:
 *    a positive bank_transaction.amount_cents is money OUT, as in Plaid. packages/data's
 *    mapItemSnapshot is the one place that converts these into the app's Account and Transaction.
 * 2. What the user enters or the app computes: app_user, income_profile, goal, account_detail
 *    (terms Plaid doesn't provide), budget, balance_snapshot (net worth history).
 * 3. Platform: credential (email + password sign-in), live_event (dashboard pushes), admin,
 *    user_identity.
 *
 * Rules:
 * - Every table is private. Browsers read through per-user views (Sprint 5), never raw tables.
 * - Only identities in `admin` can call reducers. `init` adds the publisher, which is the same
 *   identity as the API's SPACETIME_TOKEN.
 * - IDs come from the caller (Plaid's IDs for bank data). Reducers called over HTTP return nothing.
 *
 * Publish: `npm run publish:maincloud -w @finvantage/spacetime` (see apps/spacetime/README.md).
 */
import { schema, table, t, SenderError, type Infer, type InferSchema, type ReducerCtx } from "spacetimedb/server";

// ── Platform ─────────────────────────────────────────────────────────────────

const admin = table({ name: "admin" }, { identity: t.identity().primaryKey() });

/** Maps a signed-in browser's Spacetime identity to a FinVantage user id. */
const userIdentity = table(
  { name: "user_identity" },
  { identity: t.identity().primaryKey(), userId: t.string().index("btree") },
);

/** Email + password sign-in. Only the API reads or writes it. The hash is scrypt, never a password. */
const credential = table(
  { name: "credential" },
  {
    /** Lowercased. */
    email: t.string().primaryKey(),
    userId: t.string().unique(),
    passwordHash: t.string(),
    createdAt: t.timestamp(),
  },
);

/**
 * One row per dashboard push. `payload` is a JSON-encoded LiveEvent, validated with the Zod
 * schema on both ends. Subscribers only use it as a signal to refetch from the API.
 */
const liveEvent = table(
  { name: "live_event" },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.string().index("btree"),
    payload: t.string(),
    createdAt: t.timestamp(),
  },
);

// ── User-entered and computed ────────────────────────────────────────────────

const appUser = table(
  { name: "app_user" },
  {
    id: t.string().primaryKey(),
    displayName: t.string(),
    email: t.option(t.string()),
    bufferTargetCents: t.i64(),
    extensionEnabled: t.bool(),
    snoozedSites: t.array(t.string()),
  },
);

const incomeProfile = table(
  { name: "income_profile" },
  {
    userId: t.string().primaryKey(),
    monthlyIncomeCents: t.i64(),
    monthlyFixedCostsCents: t.i64(),
    monthlyDebtPaymentsCents: t.i64(),
    monthlySpendingCents: t.i64(),
    monthlySavingsCents: t.i64(),
    paydayDayOfMonth: t.u8(),
  },
);

const goal = table(
  { name: "goal" },
  {
    id: t.string().primaryKey(),
    userId: t.string().index("btree"),
    name: t.string(),
    targetCents: t.i64(),
    currentCents: t.i64(),
    targetDate: t.string(),
    priorityRank: t.u32(),
    /** Flexibility from @finvantage/contracts. */
    flexibility: t.string(),
    linkedAccountId: t.option(t.string()),
  },
);

/** Terms the bank doesn't report (deposit rates, installment loans, promo end dates). */
const accountDetail = table(
  { name: "account_detail" },
  {
    accountId: t.string().primaryKey(),
    userId: t.string().index("btree"),
    /** Decimal fraction: 0.0525 means 5.25%. */
    annualRate: t.option(t.f64()),
    minimumPaymentCents: t.option(t.i64()),
    promoRateEndsOn: t.option(t.string()),
  },
);

/** Budget envelopes (PRD feature 3). One per user and category. */
const budget = table(
  { name: "budget" },
  {
    /** `${userId}:${category}`. */
    id: t.string().primaryKey(),
    userId: t.string().index("btree"),
    category: t.string(),
    monthlyLimitCents: t.i64(),
  },
);

/** An account's balance on one day, saved on each sync. Net worth over time (PRD feature 4). */
const balanceSnapshot = table(
  { name: "balance_snapshot" },
  {
    /** `${accountId}:${date}`. */
    id: t.string().primaryKey(),
    accountId: t.string().index("btree"),
    userId: t.string().index("btree"),
    date: t.string(),
    balanceCents: t.i64(),
  },
);

// ── Bank data, mirroring Plaid ──────────────────────────────────────────────

/** One bank login (a Plaid Item). The access token is never stored here. */
const bankItem = table(
  { name: "bank_item" },
  {
    itemId: t.string().primaryKey(),
    userId: t.string().index("btree"),
    institutionId: t.option(t.string()),
    institutionName: t.string(),
    /** /transactions/sync cursor. None before the first sync. */
    transactionsCursor: t.option(t.string()),
    /** "good", or why it needs attention, such as "login_required". */
    status: t.string(),
    updatedAt: t.timestamp(),
  },
);

/** Plaid account. Balances are cents. For cards and loans, `current` is the amount owed. */
const bankAccount = table(
  { name: "bank_account" },
  {
    accountId: t.string().primaryKey(),
    itemId: t.string().index("btree"),
    userId: t.string().index("btree"),
    name: t.string(),
    officialName: t.option(t.string()),
    mask: t.option(t.string()),
    /** depository, credit, loan, investment, brokerage, other. */
    type: t.string(),
    subtype: t.option(t.string()),
    currentCents: t.option(t.i64()),
    availableCents: t.option(t.i64()),
    limitCents: t.option(t.i64()),
    isoCurrencyCode: t.option(t.string()),
  },
);

/** Plaid transaction. `amountCents` keeps Plaid's sign: positive is money OUT. */
const bankTransaction = table(
  { name: "bank_transaction" },
  {
    transactionId: t.string().primaryKey(),
    accountId: t.string().index("btree"),
    userId: t.string().index("btree"),
    amountCents: t.i64(),
    isoCurrencyCode: t.option(t.string()),
    date: t.string(),
    authorizedDate: t.option(t.string()),
    name: t.string(),
    merchantName: t.option(t.string()),
    merchantEntityId: t.option(t.string()),
    logoUrl: t.option(t.string()),
    website: t.option(t.string()),
    /** online, in store, other. */
    paymentChannel: t.string(),
    pending: t.bool(),
    pendingTransactionId: t.option(t.string()),
    pfcPrimary: t.option(t.string()),
    pfcDetailed: t.option(t.string()),
    pfcConfidence: t.option(t.string()),
  },
);

const Apr = t.object("Apr", { aprPercentage: t.f64(), aprType: t.string() });

/** One row per liability account, flattening Plaid's credit, mortgage, and student shapes. */
const liability = table(
  { name: "liability" },
  {
    accountId: t.string().primaryKey(),
    userId: t.string().index("btree"),
    /** credit, mortgage, student. */
    kind: t.string(),
    /** Credit cards only. */
    aprs: t.array(Apr),
    /** Mortgages and student loans. Percent: 6.25 means 6.25%. */
    interestRatePercentage: t.option(t.f64()),
    /** Credit and student: minimum_payment_amount. Mortgage: next_monthly_payment. */
    minimumPaymentCents: t.option(t.i64()),
    nextPaymentDueDate: t.option(t.string()),
    lastPaymentAmountCents: t.option(t.i64()),
    lastPaymentDate: t.option(t.string()),
    lastStatementBalanceCents: t.option(t.i64()),
    isOverdue: t.option(t.bool()),
    originationDate: t.option(t.string()),
    maturityDate: t.option(t.string()),
    originationPrincipalCents: t.option(t.i64()),
    expectedPayoffDate: t.option(t.string()),
  },
);

/** Plaid recurring stream (/transactions/recurring/get). Amounts keep Plaid's sign. */
const recurringStream = table(
  { name: "recurring_stream" },
  {
    streamId: t.string().primaryKey(),
    accountId: t.string().index("btree"),
    userId: t.string().index("btree"),
    /** inflow or outflow. */
    direction: t.string(),
    description: t.string(),
    merchantName: t.option(t.string()),
    firstDate: t.string(),
    lastDate: t.string(),
    predictedNextDate: t.option(t.string()),
    /** UNKNOWN, WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, ANNUALLY. */
    frequency: t.string(),
    transactionIds: t.array(t.string()),
    averageAmountCents: t.i64(),
    lastAmountCents: t.i64(),
    isActive: t.bool(),
    /** UNKNOWN, MATURE, EARLY_DETECTION, TOMBSTONED. */
    status: t.string(),
    pfcPrimary: t.option(t.string()),
    pfcDetailed: t.option(t.string()),
  },
);

/** Plaid security. Shared across users. */
const security = table(
  { name: "security" },
  {
    securityId: t.string().primaryKey(),
    name: t.option(t.string()),
    tickerSymbol: t.option(t.string()),
    /** cash, cryptocurrency, derivative, equity, etf, fixed income, loan, mutual fund, other. */
    type: t.option(t.string()),
    closePriceCents: t.option(t.i64()),
    closePriceAsOf: t.option(t.string()),
    isCashEquivalent: t.option(t.bool()),
  },
);

/** Plaid holding (/investments/holdings/get). Feeds the portfolio view (PRD feature 6). */
const holding = table(
  { name: "holding" },
  {
    /** `${accountId}:${securityId}`. */
    id: t.string().primaryKey(),
    accountId: t.string().index("btree"),
    userId: t.string().index("btree"),
    securityId: t.string(),
    quantity: t.f64(),
    institutionPriceCents: t.i64(),
    institutionValueCents: t.i64(),
    costBasisCents: t.option(t.i64()),
    isoCurrencyCode: t.option(t.string()),
  },
);

const spacetimedb = schema({
  admin,
  userIdentity,
  credential,
  liveEvent,
  appUser,
  incomeProfile,
  goal,
  accountDetail,
  budget,
  balanceSnapshot,
  bankItem,
  bankAccount,
  bankTransaction,
  liability,
  recurringStream,
  security,
  holding,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/** Old live events are only signals, so each user keeps the newest few. */
const LIVE_EVENTS_KEPT = 50;

function requireAdmin(ctx: Ctx) {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError("Only the API can write.");
}

function requireItem(ctx: Ctx, itemId: string) {
  const item = ctx.db.bankItem.itemId.find(itemId);
  if (!item) throw new SenderError(`No bank item ${itemId}.`);
  return item;
}

/** Account IDs belonging to an item. */
function itemAccountIds(ctx: Ctx, itemId: string): Set<string> {
  return new Set([...ctx.db.bankAccount.itemId.filter(itemId)].map((a) => a.accountId));
}

// Insert-or-replace helpers. The primary key accessor's update needs an existing row.
function putUser(ctx: Ctx, row: Infer<typeof appUser.rowType>) {
  if (ctx.db.appUser.id.find(row.id)) ctx.db.appUser.id.update(row);
  else ctx.db.appUser.insert(row);
}
function putIncome(ctx: Ctx, row: Infer<typeof incomeProfile.rowType>) {
  if (ctx.db.incomeProfile.userId.find(row.userId)) ctx.db.incomeProfile.userId.update(row);
  else ctx.db.incomeProfile.insert(row);
}
function putTransaction(ctx: Ctx, row: Infer<typeof bankTransaction.rowType>) {
  if (ctx.db.bankTransaction.transactionId.find(row.transactionId)) ctx.db.bankTransaction.transactionId.update(row);
  else ctx.db.bankTransaction.insert(row);
}
function putSecurity(ctx: Ctx, row: Infer<typeof security.rowType>) {
  if (ctx.db.security.securityId.find(row.securityId)) ctx.db.security.securityId.update(row);
  else ctx.db.security.insert(row);
}
function putBalanceSnapshot(ctx: Ctx, row: Infer<typeof balanceSnapshot.rowType>) {
  if (ctx.db.balanceSnapshot.id.find(row.id)) ctx.db.balanceSnapshot.id.update(row);
  else ctx.db.balanceSnapshot.insert(row);
}

function replaceItemAccounts(ctx: Ctx, itemId: string, rows: (Infer<typeof bankAccount.rowType>)[]) {
  for (const row of [...ctx.db.bankAccount.itemId.filter(itemId)]) ctx.db.bankAccount.accountId.delete(row.accountId);
  for (const row of rows) {
    if (row.itemId !== itemId) throw new SenderError(`Account ${row.accountId} belongs to another item.`);
    ctx.db.bankAccount.insert(row);
  }
}

function replaceItemLiabilities(ctx: Ctx, itemId: string, rows: (Infer<typeof liability.rowType>)[]) {
  const accounts = itemAccountIds(ctx, itemId);
  for (const id of accounts) ctx.db.liability.accountId.delete(id);
  for (const row of rows) {
    if (!accounts.has(row.accountId)) throw new SenderError(`Liability ${row.accountId} is not on item ${itemId}.`);
    ctx.db.liability.insert(row);
  }
}

function replaceItemStreams(ctx: Ctx, itemId: string, rows: (Infer<typeof recurringStream.rowType>)[]) {
  const accounts = itemAccountIds(ctx, itemId);
  for (const id of accounts) {
    for (const row of [...ctx.db.recurringStream.accountId.filter(id)]) ctx.db.recurringStream.streamId.delete(row.streamId);
  }
  for (const row of rows) {
    if (!accounts.has(row.accountId)) throw new SenderError(`Stream ${row.streamId} is not on item ${itemId}.`);
    ctx.db.recurringStream.insert(row);
  }
}

function replaceItemHoldings(
  ctx: Ctx,
  itemId: string,
  securities: (Infer<typeof security.rowType>)[],
  rows: (Infer<typeof holding.rowType>)[],
) {
  for (const row of securities) putSecurity(ctx, row);
  const accounts = itemAccountIds(ctx, itemId);
  for (const id of accounts) {
    for (const row of [...ctx.db.holding.accountId.filter(id)]) ctx.db.holding.id.delete(row.id);
  }
  for (const row of rows) {
    if (!accounts.has(row.accountId)) throw new SenderError(`Holding ${row.id} is not on item ${itemId}.`);
    ctx.db.holding.insert(row);
  }
}

/** Removes an item and everything under it. */
function deleteItem(ctx: Ctx, itemId: string) {
  for (const accountId of itemAccountIds(ctx, itemId)) {
    for (const row of [...ctx.db.bankTransaction.accountId.filter(accountId)]) {
      ctx.db.bankTransaction.transactionId.delete(row.transactionId);
    }
    for (const row of [...ctx.db.recurringStream.accountId.filter(accountId)]) ctx.db.recurringStream.streamId.delete(row.streamId);
    for (const row of [...ctx.db.holding.accountId.filter(accountId)]) ctx.db.holding.id.delete(row.id);
    for (const row of [...ctx.db.balanceSnapshot.accountId.filter(accountId)]) ctx.db.balanceSnapshot.id.delete(row.id);
    ctx.db.liability.accountId.delete(accountId);
    ctx.db.accountDetail.accountId.delete(accountId);
    ctx.db.bankAccount.accountId.delete(accountId);
  }
  ctx.db.bankItem.itemId.delete(itemId);
}

// ── Lifecycle and admin ──────────────────────────────────────────────────────

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
});

export const addAdmin = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  requireAdmin(ctx);
  if (!ctx.db.admin.identity.find(identity)) ctx.db.admin.insert({ identity });
});

export const linkIdentity = spacetimedb.reducer(
  { identity: t.identity(), userId: t.string() },
  (ctx, { identity, userId }) => {
    requireAdmin(ctx);
    if (ctx.db.userIdentity.identity.find(identity)) ctx.db.userIdentity.identity.update({ identity, userId });
    else ctx.db.userIdentity.insert({ identity, userId });
  },
);

export const registerCredential = spacetimedb.reducer(
  { email: t.string(), userId: t.string(), passwordHash: t.string() },
  (ctx, { email, userId, passwordHash }) => {
    requireAdmin(ctx);
    const key = email.trim().toLowerCase();
    if (ctx.db.credential.email.find(key)) throw new SenderError("email_taken");
    ctx.db.credential.insert({ email: key, userId, passwordHash, createdAt: ctx.timestamp });
  },
);

// ── User-entered data ────────────────────────────────────────────────────────

export const saveUser = spacetimedb.reducer({ user: appUser.rowType }, (ctx, { user }) => {
  requireAdmin(ctx);
  putUser(ctx, user);
});

export const saveIncomeProfile = spacetimedb.reducer({ income: incomeProfile.rowType }, (ctx, { income }) => {
  requireAdmin(ctx);
  putIncome(ctx, income);
});

export const createGoal = spacetimedb.reducer({ goal: goal.rowType }, (ctx, { goal: row }) => {
  requireAdmin(ctx);
  ctx.db.goal.insert(row);
});

export const saveAccountDetail = spacetimedb.reducer({ detail: accountDetail.rowType }, (ctx, { detail }) => {
  requireAdmin(ctx);
  if (ctx.db.accountDetail.accountId.find(detail.accountId)) ctx.db.accountDetail.accountId.update(detail);
  else ctx.db.accountDetail.insert(detail);
});

export const setBudget = spacetimedb.reducer(
  { userId: t.string(), category: t.string(), monthlyLimitCents: t.i64() },
  (ctx, { userId, category, monthlyLimitCents }) => {
    requireAdmin(ctx);
    const row = { id: `${userId}:${category}`, userId, category, monthlyLimitCents };
    if (ctx.db.budget.id.find(row.id)) ctx.db.budget.id.update(row);
    else ctx.db.budget.insert(row);
  },
);

export const deleteBudget = spacetimedb.reducer({ userId: t.string(), category: t.string() }, (ctx, { userId, category }) => {
  requireAdmin(ctx);
  ctx.db.budget.id.delete(`${userId}:${category}`);
});

export const recordBalanceSnapshots = spacetimedb.reducer(
  { snapshots: t.array(balanceSnapshot.rowType) },
  (ctx, { snapshots }) => {
    requireAdmin(ctx);
    for (const row of snapshots) putBalanceSnapshot(ctx, row);
  },
);

// ── Bank sync, one call per Plaid endpoint ───────────────────────────────────

export const upsertBankItem = spacetimedb.reducer(
  { itemId: t.string(), userId: t.string(), institutionId: t.option(t.string()), institutionName: t.string(), status: t.string() },
  (ctx, args) => {
    requireAdmin(ctx);
    const existing = ctx.db.bankItem.itemId.find(args.itemId);
    if (existing && existing.userId !== args.userId) throw new SenderError(`Item ${args.itemId} belongs to another user.`);
    const row = {
      ...args,
      institutionId: args.institutionId,
      transactionsCursor: existing?.transactionsCursor,
      updatedAt: ctx.timestamp,
    };
    if (existing) ctx.db.bankItem.itemId.update(row);
    else ctx.db.bankItem.insert(row);
  },
);

/** /accounts/get: the item's full account list, replacing what was there. */
export const replaceBankAccounts = spacetimedb.reducer(
  { itemId: t.string(), accounts: t.array(bankAccount.rowType) },
  (ctx, { itemId, accounts }) => {
    requireAdmin(ctx);
    requireItem(ctx, itemId);
    replaceItemAccounts(ctx, itemId, accounts);
  },
);

/** One /transactions/sync page: upsert added and modified, delete removed, then save the cursor. */
export const syncBankTransactions = spacetimedb.reducer(
  {
    itemId: t.string(),
    added: t.array(bankTransaction.rowType),
    modified: t.array(bankTransaction.rowType),
    removedTransactionIds: t.array(t.string()),
    nextCursor: t.string(),
  },
  (ctx, { itemId, added, modified, removedTransactionIds, nextCursor }) => {
    requireAdmin(ctx);
    const item = requireItem(ctx, itemId);
    const accounts = itemAccountIds(ctx, itemId);
    for (const row of [...added, ...modified]) {
      if (!accounts.has(row.accountId)) throw new SenderError(`Transaction ${row.transactionId} is not on item ${itemId}.`);
      putTransaction(ctx, row);
    }
    for (const id of removedTransactionIds) ctx.db.bankTransaction.transactionId.delete(id);
    ctx.db.bankItem.itemId.update({ ...item, transactionsCursor: nextCursor, updatedAt: ctx.timestamp });
  },
);

/** /liabilities/get for one item. */
export const replaceLiabilities = spacetimedb.reducer(
  { itemId: t.string(), liabilities: t.array(liability.rowType) },
  (ctx, { itemId, liabilities }) => {
    requireAdmin(ctx);
    requireItem(ctx, itemId);
    replaceItemLiabilities(ctx, itemId, liabilities);
  },
);

/** /transactions/recurring/get for one item. */
export const replaceRecurringStreams = spacetimedb.reducer(
  { itemId: t.string(), streams: t.array(recurringStream.rowType) },
  (ctx, { itemId, streams }) => {
    requireAdmin(ctx);
    requireItem(ctx, itemId);
    replaceItemStreams(ctx, itemId, streams);
  },
);

/** /investments/holdings/get for one item. */
export const replaceHoldings = spacetimedb.reducer(
  { itemId: t.string(), securities: t.array(security.rowType), holdings: t.array(holding.rowType) },
  (ctx, { itemId, securities, holdings }) => {
    requireAdmin(ctx);
    requireItem(ctx, itemId);
    replaceItemHoldings(ctx, itemId, securities, holdings);
  },
);

/** The user unlinked a bank. */
export const removeBankItem = spacetimedb.reducer({ itemId: t.string() }, (ctx, { itemId }) => {
  requireAdmin(ctx);
  requireItem(ctx, itemId);
  deleteItem(ctx, itemId);
});

// ── Demo profile ─────────────────────────────────────────────────────────────

const BankItemInput = t.object("BankItemInput", {
  itemId: t.string(),
  institutionId: t.option(t.string()),
  institutionName: t.string(),
  transactionsCursor: t.option(t.string()),
  status: t.string(),
});

const BankItemLoad = t.object("BankItemLoad", {
  item: BankItemInput,
  accounts: t.array(bankAccount.rowType),
  transactions: t.array(bankTransaction.rowType),
  liabilities: t.array(liability.rowType),
  streams: t.array(recurringStream.rowType),
  securities: t.array(security.rowType),
  holdings: t.array(holding.rowType),
});

/** Replaces everything a user has in one transaction. Used to load the demo profile. */
export const loadProfile = spacetimedb.reducer(
  {
    user: appUser.rowType,
    income: incomeProfile.rowType,
    goals: t.array(goal.rowType),
    bank: t.array(BankItemLoad),
    accountDetails: t.array(accountDetail.rowType),
    budgets: t.array(budget.rowType),
    balanceSnapshots: t.array(balanceSnapshot.rowType),
  },
  (ctx, { user, income, goals, bank, accountDetails, budgets, balanceSnapshots }) => {
    requireAdmin(ctx);
    const userId = user.id;
    for (const item of [...ctx.db.bankItem.userId.filter(userId)]) deleteItem(ctx, item.itemId);
    for (const row of [...ctx.db.goal.userId.filter(userId)]) ctx.db.goal.id.delete(row.id);
    for (const row of [...ctx.db.budget.userId.filter(userId)]) ctx.db.budget.id.delete(row.id);
    for (const row of [...ctx.db.accountDetail.userId.filter(userId)]) ctx.db.accountDetail.accountId.delete(row.accountId);

    putUser(ctx, user);
    putIncome(ctx, { ...income, userId });
    for (const row of goals) ctx.db.goal.insert({ ...row, userId });
    for (const load of bank) {
      ctx.db.bankItem.insert({
        itemId: load.item.itemId,
        userId,
        institutionId: load.item.institutionId,
        institutionName: load.item.institutionName,
        transactionsCursor: load.item.transactionsCursor,
        status: load.item.status,
        updatedAt: ctx.timestamp,
      });
      replaceItemAccounts(ctx, load.item.itemId, load.accounts.map((a) => ({ ...a, userId })));
      for (const row of load.transactions) putTransaction(ctx, { ...row, userId });
      replaceItemLiabilities(ctx, load.item.itemId, load.liabilities.map((l) => ({ ...l, userId })));
      replaceItemStreams(ctx, load.item.itemId, load.streams.map((s) => ({ ...s, userId })));
      replaceItemHoldings(ctx, load.item.itemId, load.securities, load.holdings.map((h) => ({ ...h, userId })));
    }
    for (const row of accountDetails) ctx.db.accountDetail.insert({ ...row, userId });
    for (const row of budgets) ctx.db.budget.insert({ ...row, userId });
    for (const row of balanceSnapshots) putBalanceSnapshot(ctx, { ...row, userId });
  },
);

// ── Live events ──────────────────────────────────────────────────────────────

export const publishLiveEvent = spacetimedb.reducer(
  { userId: t.string(), payload: t.string() },
  (ctx, { userId, payload }) => {
    requireAdmin(ctx);
    ctx.db.liveEvent.insert({ id: 0n, userId, payload, createdAt: ctx.timestamp });
    const rows = [...ctx.db.liveEvent.userId.filter(userId)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const row of rows.slice(0, Math.max(0, rows.length - LIVE_EVENTS_KEPT))) ctx.db.liveEvent.id.delete(row.id);
  },
);
