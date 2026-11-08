import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { ApiError, createApiClient, isLiability } from "@finvantage/contracts";
import { decryptToken, encryptToken, loadDemoProfileSource } from "@finvantage/data";
import { createApp } from "./app";
import { createDeps } from "./deps";
import { averageCashFlow, monthlyCashFlow, monthsBefore } from "./reporting/cashflow";

// No Plaid keys in tests, so the synthetic provider stands in for Plaid with the same flow.
async function signedIn() {
  const deps = createDeps({ REPORT_OUTPUT_DIR: "/tmp/finvantage-report-tests" });
  const app = createApp(deps, {});
  const fetchImpl = ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch;
  const anon = createApiClient({ baseUrl: "http://test", token: "", fetch: fetchImpl });
  const { token, user } = await anon.signUp({
    body: { displayName: "Bank Tester", email: `bank-${Date.now()}@example.com`, password: "s3cret-pass" },
  });
  return { deps, app, user, client: createApiClient({ baseUrl: "http://test", token, fetch: fetchImpl }) };
}

const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
};

/** The synthetic bank links the demo profile's own bank, so its account count comes from the fixture. */
const DEMO_BANK_ACCOUNTS = loadDemoProfileSource().bank[0]!.accounts.length;

test("linking a bank replaces the demo copy's accounts, and a re-sync doesn't duplicate them", async () => {
  const { client, deps, user } = await signedIn();

  const item = await client.linkSandboxBank();
  assert.equal(item.institutionName, "Demo Bank");
  assert.equal(item.accountCount, DEMO_BANK_ACCOUNTS);
  assert.deepEqual((await client.listBankItems()).map((i) => i.itemId), [item.itemId]);

  // The linked bank is the truth about the user's money: the demo copy's accounts are hidden, so
  // nothing is counted twice (packages/data/src/linked-banks.ts).
  const accounts = await client.listAccounts();
  assert.equal(accounts.length, DEMO_BANK_ACCOUNTS);
  assert.ok(accounts.every((a) => a.id.startsWith(`${item.itemId}__`)));
  const linked = accounts.filter((a) => a.id.startsWith(`${item.itemId}__`));
  assert.ok(linked.some((a) => a.type === "credit_card" && a.annualRate === 0.2299 && a.nextPaymentDueOn === "2026-11-25"));
  const transactions = await client.listTransactions({ query: { limit: 500 } });
  assert.ok(transactions.length > 0);
  assert.ok(transactions.every((t) => t.accountId.startsWith(`${item.itemId}__`)));

  await client.syncBankItem({ params: { id: item.itemId } });
  assert.equal((await client.listTransactions({ query: { limit: 500 } })).length, transactions.length);

  // The access token is stored, but never sent to the client.
  assert.ok(await deps.bankTokens.get(user.id, item.itemId));
  assert.ok(!JSON.stringify(await client.listBankItems()).includes("access"));
});

test("removing a bank removes everything under it", async () => {
  const { client } = await signedIn();
  const before = (await client.listAccounts()).length;
  const item = await client.linkSandboxBank();
  assert.deepEqual(await client.removeBankItem({ params: { id: item.itemId } }), { deleted: true });
  assert.equal((await client.listAccounts()).length, before);
  assert.deepEqual(await client.listBankItems(), []);
  assert.equal(await status(client.syncBankItem({ params: { id: item.itemId } })), 404);
});

test("the shared demo user can't link a bank, and nobody can touch another user's bank", async () => {
  const { app } = await signedIn();
  const demo = createApiClient({
    baseUrl: "http://test",
    token: "demo-token",
    fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
  });
  assert.equal(await status(demo.createBankLinkToken()), 403);
  assert.equal(await status(demo.linkSandboxBank()), 403);

  const owner = await signedIn();
  const item = await owner.client.linkSandboxBank();
  const other = await signedIn();
  assert.equal(await status(other.client.syncBankItem({ params: { id: item.itemId } })), 404);
  assert.equal(await status(other.client.removeBankItem({ params: { id: item.itemId } })), 404);
});

test("access tokens are encrypted, bound to their item, and tamper-evident", () => {
  const key = randomBytes(32);
  const sealed = encryptToken(key, "item_1", "access-sandbox-123");
  assert.ok(!sealed.includes("access-sandbox"));
  assert.notEqual(sealed, encryptToken(key, "item_1", "access-sandbox-123"), "fresh IV each time");
  assert.equal(decryptToken(key, "item_1", sealed), "access-sandbox-123");
  assert.throws(() => decryptToken(key, "item_2", sealed), "a token can't be moved to another item");
  assert.throws(() => decryptToken(randomBytes(32), "item_1", sealed), "wrong key");
  const raw = Buffer.from(sealed, "base64");
  raw[raw.length - 1] ^= 1;
  assert.throws(() => decryptToken(key, "item_1", raw.toString("base64")), "tampered ciphertext");
});

test("merchant rules apply to bank-synced transactions, and a hand-made choice beats a rule", async () => {
  const { client } = await signedIn();
  await client.linkSandboxBank();
  const [first, second] = (await client.listTransactions({ query: { limit: 500 } })).filter((t) => t.amountCents < 0);
  const plaidChoice = first!.category;

  // A rule written after the sync still shapes what the user sees, with no "apply to past".
  await client.createCategoryRule({ body: { merchantContains: first!.merchant, categoryId: "giving.donations" } });
  const ruled = (await client.listTransactions({ query: { limit: 500 } })).find((t) => t.id === first!.id);
  assert.equal(ruled?.subcategory, "giving.donations");
  assert.notEqual(plaidChoice, "giving", "the test needs a transaction Plaid put elsewhere");

  // Moving a transaction by hand wins over a rule that would match it.
  await client.recategorizeTransaction({ params: { id: second!.id }, body: { categoryId: "travel" } });
  await client.createCategoryRule({ body: { merchantContains: second!.merchant, categoryId: "giving.donations", applyToPast: false } });
  const kept = (await client.listTransactions({ query: { limit: 500 } })).find((t) => t.id === second!.id);
  assert.equal(kept?.category, "travel");
});

test("a linked user's report runs on their bank, even with no saved simulation", async () => {
  const { client, deps, user } = await signedIn();
  const item = await client.linkSandboxBank();

  // The synthetic bank's history: paychecks in October 2026, spending in November.
  const report = await client.generateReport({ body: { quarter: "2026-Q4", email: false } });
  assert.equal(report.visuals.dataSource, "bank");
  assert.equal(report.visuals.outlookAsOf, deps.today());

  // The run made for the report was simulated on the bank's accounts and cash flow.
  const [run] = await deps.docs.listSimulationRuns(user.id);
  assert.ok(run);
  assert.ok(run.inputs.snapshot.accounts.every((a) => a.id.startsWith(`${item.itemId}__`)));
  const transactions = await client.listTransactions({ query: { limit: 500 } });
  const expected = monthlyCashFlow(transactions, ["2026-10", "2026-11", "2026-12"]);
  assert.deepEqual(
    report.visuals.monthlyBreakdown.map((m) => [m.monthKey, m.incomeCents, m.spendingCents]),
    expected.map((m) => [m.monthKey, m.incomeCents, m.spendingCents]),
  );
  assert.ok(expected[0]!.incomeCents > 0 && expected[1]!.spendingCents > 0);
  // The snapshot's cash flow comes from the bank's last three months, not the profile's estimate.
  const flow = averageCashFlow(monthlyCashFlow(transactions, monthsBefore(deps.today().slice(0, 7), 3)), { complete: true });
  const income = await deps.ledger.getIncomeProfile(user.id);
  assert.equal(run.inputs.snapshot.monthlyIncomeCents, flow ? flow.incomeCents : income!.monthlyIncomeCents);

  const accounts = await client.listAccounts();
  const netWorth = accounts.reduce((sum, a) => sum + (isLiability(a.type) ? -a.balanceCents : a.balanceCents), 0);
  assert.equal(report.visuals.summary.netWorthCents, netWorth);
  assert.equal(report.pdf.status, "ready");
});

test("once a bank is linked, reports skip simulations made on the demo copy", async () => {
  const { client, deps, user } = await signedIn();
  await client.loadDemoProfile(); // saves three backdated runs on the demo copy
  const demoRuns = new Set((await deps.docs.listSimulationRuns(user.id)).map((r) => r.id));
  assert.equal(demoRuns.size, 3);

  const before = await client.generateReport({ body: { email: false } });
  assert.equal(before.visuals.dataSource, "demo");
  assert.equal(before.visuals.outlookAsOf, null);
  assert.ok(before.evidence.some((e) => demoRuns.has(e.sourceId)));

  await client.linkSandboxBank();
  const after = await client.generateReport({ body: { email: false } });
  assert.equal(after.visuals.dataSource, "bank");
  assert.ok(after.visuals.outlookAsOf);
  assert.equal(after.previousQuarter, null);
  assert.ok(after.evidence.every((e) => !demoRuns.has(e.sourceId)));
});
