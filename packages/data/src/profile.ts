import { z } from "zod";
import {
  Account,
  Cents,
  Goal,
  LifeEvent,
  Transaction,
  User,
  type FinancialSnapshot,
} from "@finvantage/contracts";
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

export const DemoProfile = z.object({
  user: User,
  income: IncomeProfile,
  accounts: z.array(Account),
  goals: z.array(Goal),
  transactions: z.array(Transaction),
  lifeEvents: z.array(LifeEvent),
});
export type DemoProfile = z.infer<typeof DemoProfile>;

export const DEMO_USER_ID = "user_demo";

/** Editing the fixture changes cards and projections with no code change (PRD section 6). */
export function loadDemoProfileFixture(name = "planner"): DemoProfile {
  const fixture = FIXTURES[name];
  if (fixture === undefined) throw new Error(`Unknown demo profile fixture: ${name}`);
  // structuredClone so callers can never mutate the shared imported object.
  return DemoProfile.parse(structuredClone(fixture));
}

/**
 * The demo profile owned by `userId`. A signed-in user gets their own copy, so record IDs are
 * prefixed with the user ID to keep them unique across users. The demo user keeps the fixture IDs.
 */
export function demoProfileFor(userId: string, name = "planner"): DemoProfile {
  const profile = loadDemoProfileFixture(name);
  if (userId === DEMO_USER_ID) return profile;
  const id = (original: string) => `${userId}__${original}`;
  return {
    user: { ...profile.user, id: userId },
    income: profile.income,
    accounts: profile.accounts.map((a) => ({ ...a, id: id(a.id), userId })),
    goals: profile.goals.map((g) => ({
      ...g,
      id: id(g.id),
      userId,
      linkedAccountId: g.linkedAccountId === null ? null : id(g.linkedAccountId),
    })),
    transactions: profile.transactions.map((t) => ({ ...t, id: id(t.id), accountId: id(t.accountId) })),
    lifeEvents: profile.lifeEvents.map((e) => ({ ...e, id: id(e.id), userId })),
  };
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
