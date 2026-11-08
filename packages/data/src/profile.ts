import { z } from "zod";
import {
  Account,
  BalanceSnapshot,
  BudgetLimit,
  Cents,
  Goal,
  LifeEvent,
  Transaction,
  User,
  type FinancialSnapshot,
  type InvestmentAccountRef,
  type InvestmentPosition,
} from "@finvantage/contracts";
import { AccountDetails, mapItemSnapshot, toCents } from "./plaid/map";
import { PlaidItemSnapshot } from "./plaid/schema";
// A static import, not a file read, so the fixture survives bundling for serverless deploys.
import planner from "../fixtures/planner.json" with { type: "json" };

const FIXTURES: Record<string, unknown> = { planner };

export const IncomeProfile = z.object({
  monthlyIncomeCents: Cents,
  monthlyFixedCostsCents: Cents,
  monthlyDebtPaymentsCents: Cents,
  monthlySpendingCents: Cents,
  monthlySavingsCents: Cents,
  paydayDayOfMonth: z.number().int().min(1).max(28),
});
export type IncomeProfile = z.infer<typeof IncomeProfile>;

/**
 * A fixture file. Bank data is in Plaid's own format (one snapshot per Plaid Item), so the demo
 * goes through the same mapper as a real bank connection. `accountDetails` is what a person
 * would enter by hand because Plaid doesn't provide it.
 */
export const DemoProfileSource = z.object({
  user: User,
  income: IncomeProfile,
  goals: z.array(Goal),
  lifeEvents: z.array(LifeEvent),
  bank: z.array(PlaidItemSnapshot),
  accountDetails: z.record(z.string(), AccountDetails).default({}),
  budgets: z.array(BudgetLimit).default([]),
  balanceHistory: z.array(BalanceSnapshot).default([]),
});
export type DemoProfileSource = z.infer<typeof DemoProfileSource>;

/** A fixture in the app's own types, ready for the stores. */
export const DemoProfile = z.object({
  user: User,
  income: IncomeProfile,
  accounts: z.array(Account),
  goals: z.array(Goal),
  transactions: z.array(Transaction),
  lifeEvents: z.array(LifeEvent),
  budgets: z.array(BudgetLimit),
  balanceHistory: z.array(BalanceSnapshot),
});
export type DemoProfile = z.infer<typeof DemoProfile>;

export const DEMO_USER_ID = "user_demo";

/** The raw fixture: bank data still in Plaid's format. */
export function loadDemoProfileSource(name = "planner"): DemoProfileSource {
  const fixture = FIXTURES[name];
  if (fixture === undefined) throw new Error(`Unknown demo profile fixture: ${name}`);
  // structuredClone so callers can never mutate the shared imported object.
  return DemoProfileSource.parse(structuredClone(fixture));
}

/** A fixture in the app's own types: the Plaid bank data goes through mapItemSnapshot. */
export function profileFromSource(source: DemoProfileSource): DemoProfile {
  const bank = source.bank.map((item) => mapItemSnapshot(item, source.user.id, source.accountDetails));
  return DemoProfile.parse({
    user: source.user,
    income: source.income,
    accounts: bank.flatMap((b) => b.accounts),
    transactions: bank.flatMap((b) => b.transactions),
    goals: source.goals,
    lifeEvents: source.lifeEvents,
    budgets: source.budgets,
    balanceHistory: source.balanceHistory,
  });
}

/** Editing the fixture changes cards and projections with no code change (PRD section 6). */
export function loadDemoProfileFixture(name = "planner"): DemoProfile {
  return profileFromSource(loadDemoProfileSource(name));
}

/**
 * The raw demo profile owned by `userId`. A signed-in user gets their own copy, so every record
 * ID (bank items, accounts, transactions, streams, goals) is prefixed with the user ID to stay
 * unique across users. The demo user keeps the fixture IDs. Securities are shared, so they keep theirs.
 */
export function demoSourceFor(userId: string, name = "planner"): DemoProfileSource {
  const source = loadDemoProfileSource(name);
  if (userId === DEMO_USER_ID) return source;
  const id = (original: string) => `${userId}__${original}`;
  const idOrNull = (original: string | null | undefined) => (original ? id(original) : (original ?? null));
  const onAccount = <T extends { account_id: string }>(row: T): T => ({ ...row, account_id: id(row.account_id) });
  const stream = (s: DemoProfileSource["bank"][number]["recurring"]["inflow_streams"][number]) => ({
    ...s,
    stream_id: id(s.stream_id),
    account_id: id(s.account_id),
    transaction_ids: s.transaction_ids.map(id),
  });
  return {
    ...source,
    user: { ...source.user, id: userId },
    goals: source.goals.map((g) => ({ ...g, id: id(g.id), userId, linkedAccountId: idOrNull(g.linkedAccountId) })),
    lifeEvents: source.lifeEvents.map((e) => ({ ...e, id: id(e.id), userId })),
    bank: source.bank.map((item) => ({
      ...item,
      item: { ...item.item, item_id: id(item.item.item_id) },
      accounts: item.accounts.map(onAccount),
      transactions: item.transactions.map((t) => ({
        ...onAccount(t),
        transaction_id: id(t.transaction_id),
        pending_transaction_id: idOrNull(t.pending_transaction_id),
      })),
      liabilities: {
        credit: item.liabilities.credit?.map(onAccount) ?? null,
        mortgage: item.liabilities.mortgage?.map(onAccount) ?? null,
        student: item.liabilities.student?.map(onAccount) ?? null,
      },
      recurring: {
        inflow_streams: item.recurring.inflow_streams.map(stream),
        outflow_streams: item.recurring.outflow_streams.map(stream),
      },
      investments: { holdings: item.investments.holdings.map(onAccount), securities: item.investments.securities },
    })),
    accountDetails: Object.fromEntries(Object.entries(source.accountDetails).map(([k, v]) => [id(k), v])),
    balanceHistory: source.balanceHistory.map((b) => ({ ...b, accountId: id(b.accountId) })),
  };
}

/** The demo profile owned by `userId`, in the app's types. Same IDs as demoSourceFor. */
export function demoProfileFor(userId: string, name = "planner"): DemoProfile {
  return profileFromSource(demoSourceFor(userId, name));
}

/**
 * The demo profile's investment accounts and positions, for the mocked Investments page.
 * STUB(portfolio): reads the fixture for every user. Read `holding` and `security` from the
 * ledger once it has a method for them, so linked accounts show up here.
 */
export function demoInvestments(name = "planner"): { accounts: InvestmentAccountRef[]; positions: InvestmentPosition[] } {
  const bank = loadDemoProfileSource(name).bank;
  const accounts = bank.flatMap((item) =>
    item.accounts
      .filter((a) => a.type === "investment" || a.type === "brokerage")
      .map((a) => ({ id: a.account_id, name: a.name })),
  );
  const positions = bank.flatMap((item) => {
    const securities = new Map(item.investments.securities.map((s) => [s.security_id, s]));
    return item.investments.holdings.map((holding): InvestmentPosition => {
      const security = securities.get(holding.security_id);
      const isCash = security?.type === "cash" || security?.is_cash_equivalent === true;
      return {
        accountId: holding.account_id,
        symbol: isCash ? null : (security?.ticker_symbol ?? holding.security_id),
        name: security?.name ?? security?.ticker_symbol ?? "Unknown security",
        quantity: holding.quantity,
        costBasisCents: holding.cost_basis === null ? null : toCents(holding.cost_basis),
        lastPriceCents: toCents(holding.institution_price),
      };
    });
  });
  return { accounts, positions };
}

function nextPayday(asOf: string, dayOfMonth: number): string {
  const date = new Date(`${asOf}T00:00:00Z`);
  if (date.getUTCDate() >= dayOfMonth) date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(dayOfMonth);
  return date.toISOString().slice(0, 10);
}

/**
 * STUB(transactions): income and spending come straight from the fixture. The transaction
 * pipeline should derive them from history once categorization and recurring detection exist.
 */
export function buildSnapshot(
  user: User,
  accounts: Account[],
  income: IncomeProfile,
  asOf: string,
): FinancialSnapshot {
  return {
    asOf,
    accounts,
    monthlyIncomeCents: income.monthlyIncomeCents,
    monthlyFixedCostsCents: income.monthlyFixedCostsCents,
    monthlyDebtPaymentsCents: income.monthlyDebtPaymentsCents,
    monthlySpendingCents: income.monthlySpendingCents,
    monthlySavingsCents: income.monthlySavingsCents,
    nextPaydayOn: nextPayday(asOf, income.paydayDayOfMonth),
    bufferTargetCents: user.preferences.bufferTargetCents,
  };
}
