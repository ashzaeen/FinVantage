import assert from "node:assert/strict";
import { test } from "node:test";
import { createBankProvider } from "./bank";
import { preferLinkedBanks } from "./linked-banks";
import { MemoryLedgerStore } from "./memory";
import { DEMO_USER_ID } from "./profile";

const USER = "usr_linked";

async function signedUpUser() {
  const ledger = preferLinkedBanks(new MemoryLedgerStore());
  await ledger.loadDemoProfile(USER);
  return ledger;
}

async function linkSyntheticBank(ledger: Awaited<ReturnType<typeof signedUpUser>>) {
  const bank = createBankProvider({ BANK_PROVIDER: "synthetic" });
  const { accessToken } = await bank.exchangePublicToken("public-token");
  await ledger.applyBankUpdate(USER, await bank.fetchItem(accessToken, null));
}

const checking = (accounts: { type: string }[]) => accounts.filter((a) => a.type === "checking");

test("before linking a bank, a signed-up user sees their demo copy", async () => {
  const ledger = await signedUpUser();
  const accounts = await ledger.listAccounts(USER);
  assert.ok(accounts.length > 0);
  assert.equal(checking(accounts).length, 1);
});

test("after linking, the bank replaces the demo copy: no account is counted twice", async () => {
  const ledger = await signedUpUser();
  await linkSyntheticBank(ledger);
  const accounts = await ledger.listAccounts(USER);
  assert.equal(checking(accounts).length, 1, "only the linked bank's checking");
  assert.ok(accounts.every((a) => !a.id.startsWith(`${USER}__`)), "no demo-copy account left");
  const transactions = await ledger.listTransactions(USER, 1_000);
  assert.ok(transactions.length > 0);
  assert.ok(transactions.every((t) => !t.accountId.startsWith(`${USER}__`)), "no demo-copy transaction left");
});

test("goals and income stay after linking, because a bank doesn't know them", async () => {
  const ledger = await signedUpUser();
  const goalsBefore = await ledger.listGoals(USER);
  await linkSyntheticBank(ledger);
  assert.deepEqual(await ledger.listGoals(USER), goalsBefore);
  assert.ok(await ledger.getIncomeProfile(USER));
});

test("accounts the user added by hand stay after linking", async () => {
  const ledger = await signedUpUser();
  const manual = await ledger.createAccount(USER, {
    type: "savings",
    loanKind: null,
    name: "Cash jar",
    institution: "Home",
    balanceCents: 10_000,
    annualRate: null,
    minimumPaymentCents: null,
    promoRateEndsOn: null,
    subtype: null,
    mask: null,
    availableBalanceCents: null,
    creditLimitCents: null,
    nextPaymentDueOn: null,
  });
  await linkSyntheticBank(ledger);
  assert.ok((await ledger.listAccounts(USER)).some((a) => a.id === manual.id));
});

test("the shared demo user is unchanged", async () => {
  const ledger = preferLinkedBanks(new MemoryLedgerStore());
  await ledger.loadDemoProfile(DEMO_USER_ID);
  assert.equal(checking(await ledger.listAccounts(DEMO_USER_ID)).length, 1);
});
