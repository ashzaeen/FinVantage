import { readFileSync } from "node:fs";
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
  const url = new URL(`../fixtures/${name}.json`, import.meta.url);
  return DemoProfile.parse(JSON.parse(readFileSync(url, "utf8")));
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
