/**
 * FinVantage's SpacetimeDB module: the relational ledger (users, accounts, transactions, goals,
 * income) and the live event feed the dashboard subscribes to.
 *
 * Rules:
 * - Every table is private. Browsers read through per-user views (Sprint 5), never raw tables.
 * - Only identities in `admin` can call reducers. `init` adds the publisher, which is the same
 *   identity as the API's SPACETIME_TOKEN.
 * - IDs come from the API. Reducers called over HTTP return nothing, so the caller picks them.
 * - Money is integer cents in i64, matching `Cents` in @finvantage/contracts.
 *
 * Publish: `npm run publish:maincloud -w @finvantage/spacetime` (see apps/spacetime/README.md).
 */
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from "spacetimedb/server";

const admin = table({ name: "admin" }, { identity: t.identity().primaryKey() });

/** Maps a signed-in browser's Spacetime identity to a FinVantage user id. */
const userIdentity = table(
  { name: "user_identity" },
  { identity: t.identity().primaryKey(), userId: t.string().index("btree") },
);

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

const account = table(
  { name: "account" },
  {
    id: t.string().primaryKey(),
    userId: t.string().index("btree"),
    /** AccountType from @finvantage/contracts. */
    type: t.string(),
    loanKind: t.option(t.string()),
    name: t.string(),
    institution: t.string(),
    balanceCents: t.i64(),
    annualRate: t.option(t.f64()),
    minimumPaymentCents: t.option(t.i64()),
    promoRateEndsOn: t.option(t.string()),
  },
);

const ledgerTransaction = table(
  { name: "ledger_transaction" },
  {
    id: t.string().primaryKey(),
    /** Not in the Transaction contract. Copied from the account so a user's rows are indexed. */
    userId: t.string().index("btree"),
    accountId: t.string().index("btree"),
    date: t.string(),
    amountCents: t.i64(),
    merchant: t.string(),
    category: t.option(t.string()),
    isRecurring: t.bool(),
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

const spacetimedb = schema({
  admin,
  credential,
  userIdentity,
  appUser,
  incomeProfile,
  account,
  ledgerTransaction,
  goal,
  liveEvent,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/** Old live events are only signals, so each user keeps the newest few. */
const LIVE_EVENTS_KEPT = 50;

function requireAdmin(ctx: Ctx) {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError("Only the API can write.");
}

const TransactionInput = t.object("TransactionInput", {
  id: t.string(),
  accountId: t.string(),
  date: t.string(),
  amountCents: t.i64(),
  merchant: t.string(),
  category: t.option(t.string()),
  isRecurring: t.bool(),
});

function deleteUserRows(ctx: Ctx, userId: string) {
  for (const row of [...ctx.db.ledgerTransaction.userId.filter(userId)]) {
    ctx.db.ledgerTransaction.id.delete(row.id);
  }
  for (const row of [...ctx.db.account.userId.filter(userId)]) ctx.db.account.id.delete(row.id);
  for (const row of [...ctx.db.goal.userId.filter(userId)]) ctx.db.goal.id.delete(row.id);
  ctx.db.incomeProfile.userId.delete(userId);
}

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
    if (ctx.db.userIdentity.identity.find(identity)) {
      ctx.db.userIdentity.identity.update({ identity, userId });
    } else {
      ctx.db.userIdentity.insert({ identity, userId });
    }
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

export const saveUser = spacetimedb.reducer({ user: appUser.rowType }, (ctx, { user }) => {
  requireAdmin(ctx);
  if (ctx.db.appUser.id.find(user.id)) ctx.db.appUser.id.update(user);
  else ctx.db.appUser.insert(user);
});

export const saveIncomeProfile = spacetimedb.reducer(
  { income: incomeProfile.rowType },
  (ctx, { income }) => {
    requireAdmin(ctx);
    if (ctx.db.incomeProfile.userId.find(income.userId)) ctx.db.incomeProfile.userId.update(income);
    else ctx.db.incomeProfile.insert(income);
  },
);

export const replaceAccounts = spacetimedb.reducer(
  { userId: t.string(), accounts: t.array(account.rowType) },
  (ctx, { userId, accounts }) => {
    requireAdmin(ctx);
    for (const row of [...ctx.db.account.userId.filter(userId)]) ctx.db.account.id.delete(row.id);
    for (const row of accounts) {
      if (row.userId !== userId) throw new SenderError(`Account ${row.id} belongs to another user.`);
      ctx.db.account.insert(row);
    }
  },
);

export const addTransaction = spacetimedb.reducer(
  { transaction: TransactionInput },
  (ctx, { transaction }) => {
    requireAdmin(ctx);
    const owner = ctx.db.account.id.find(transaction.accountId);
    if (!owner) throw new SenderError(`No account ${transaction.accountId}.`);
    ctx.db.ledgerTransaction.insert({ ...transaction, userId: owner.userId });
  },
);

export const createGoal = spacetimedb.reducer({ goal: goal.rowType }, (ctx, { goal: row }) => {
  requireAdmin(ctx);
  ctx.db.goal.insert(row);
});

/** Replaces everything a user has in one transaction. Used to load the demo profile. */
export const loadProfile = spacetimedb.reducer(
  {
    user: appUser.rowType,
    income: incomeProfile.rowType,
    accounts: t.array(account.rowType),
    goals: t.array(goal.rowType),
    transactions: t.array(TransactionInput),
  },
  (ctx, { user, income, accounts, goals, transactions }) => {
    requireAdmin(ctx);
    deleteUserRows(ctx, user.id);
    if (ctx.db.appUser.id.find(user.id)) ctx.db.appUser.id.update(user);
    else ctx.db.appUser.insert(user);
    ctx.db.incomeProfile.insert({ ...income, userId: user.id });
    for (const row of accounts) ctx.db.account.insert({ ...row, userId: user.id });
    for (const row of goals) ctx.db.goal.insert({ ...row, userId: user.id });
    for (const row of transactions) ctx.db.ledgerTransaction.insert({ ...row, userId: user.id });
  },
);

export const publishLiveEvent = spacetimedb.reducer(
  { userId: t.string(), payload: t.string() },
  (ctx, { userId, payload }) => {
    requireAdmin(ctx);
    ctx.db.liveEvent.insert({ id: 0n, userId, payload, createdAt: ctx.timestamp });
    const rows = [...ctx.db.liveEvent.userId.filter(userId)].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    for (const row of rows.slice(0, Math.max(0, rows.length - LIVE_EVENTS_KEPT))) {
      ctx.db.liveEvent.id.delete(row.id);
    }
  },
);
