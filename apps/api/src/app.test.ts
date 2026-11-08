import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiClient, type CopilotContext } from "@finvantage/contracts";
import { createApp, originMatcher } from "./app";
import { createDeps } from "./deps";

/** A real client against the real app, in process. Every call validates against the contracts. */
function setup(env: Record<string, string> = {}) {
  const deps = createDeps({ REPORT_OUTPUT_DIR: "/tmp/finvantage-report-tests", ...env });
  const app = createApp(deps, {});
  const client = createApiClient({
    baseUrl: "http://test",
    token: "demo-token",
    fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
  });
  return { app, client, deps };
}

const rental: CopilotContext = {
  pageType: "rental",
  itemType: "rent_monthly",
  priceCents: 195_000,
  merchant: "Demo Rentals",
};

test("requests without the token are rejected", async () => {
  const { app } = setup();
  assert.equal((await app.request("/v1/me")).status, 401);
});

test("the scheduler tick requires its separate server secret", async () => {
  const { app } = setup({ SCHEDULER_SECRET: "scheduler-test-secret" });
  assert.equal((await app.request("/internal/reports/schedule/run", { method: "POST" })).status, 401);
  const response = await app.request("/internal/reports/schedule/run", {
    method: "POST",
    headers: { authorization: "Bearer scheduler-test-secret" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { claimed: 0, sent: 0, failed: 0 });
});

test("all read routes match their contracts", async () => {
  const { client } = setup();
  await Promise.all([
    client.getMe(),
    client.listAccounts(),
    client.getNetWorth(),
    client.listTransactions(),
    client.listGoals(),
    client.listLifeEvents(),
    client.listSimulations(),
    client.listCopilotEvents(),
    client.listReports(),
    client.listBudgets(),
    client.listRecurring(),
    client.listUpcomingBills(),
    client.getSpendingSummary(),
    client.getPortfolio(),
    client.getCreditScore(),
  ]);
});

test("the demo profile covers all six account categories", async () => {
  const { client } = setup();
  const netWorth = await client.getNetWorth();
  assert.equal(netWorth.byCategory.length, 6);
  const accounts = await client.listAccounts();
  const types = new Set(accounts.map((a) => a.type));
  assert.equal(types.size, 7);
});

test("a saved life event triggers a new run and lowers the linked goal", async () => {
  const { client } = setup();
  const result = await client.createLifeEvent({
    body: {
      type: "house_purchase",
      date: "2027-06-01",
      recurrence: "one_time",
      dollarImpactCents: -800_000,
      durationMonths: null,
      linkedGoalId: "goal_house",
      source: "form",
    },
  });
  assert.equal(result.run.persisted, true);
  assert.ok(result.goalChanges.some((g) => g.probabilityHighDelta < 0));
});

test("what-if previews are returned but not stored", async () => {
  const { client } = setup();
  await client.runSimulation({
    body: {
      persist: false,
      whatIf: { monthlySavingsDeltaCents: 10_000, purchaseAmountCents: 0, eventShifts: [] },
    },
  });
  assert.equal((await client.listSimulations()).length, 0);
});

test("runs can be diffed and link to the previous run", async () => {
  const { client } = setup();
  const first = await client.runSimulation({ body: {} });
  const second = await client.runSimulation({ body: {} });
  assert.equal(second.previousRunId, first.id);
  const diff = await client.diffSimulations({ params: { id: first.id, otherId: second.id } });
  assert.equal(diff.goals.length, first.goalOutcomes.length);
});

test("the Copilot returns a card and records the event", async () => {
  const { client } = setup();
  const result = await client.evaluateCopilot({ body: rental });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.card.source, "template");
  await client.recordCopilotAction({
    params: { id: result.eventId },
    body: { action: "dismissed" },
  });
  const [event] = await client.listCopilotEvents();
  assert.equal(event?.userAction, "dismissed");
});

test("the Copilot rejects any field beyond the privacy allowlist", async () => {
  const { app } = setup();
  const res = await app.request("/v1/copilot/evaluate", {
    method: "POST",
    headers: { authorization: "Bearer demo-token", "content-type": "application/json" },
    body: JSON.stringify({ ...rental, pageText: "should never leave the browser" }),
  });
  assert.equal(res.status, 400);
});

test("the advisory stub returns at least two options", async () => {
  const { client } = setup();
  const advice = await client.getAdvice({
    body: { situation: { kind: "user_question", question: "Can I afford a car?" } },
  });
  assert.ok(advice.options.length >= 2);
});

test("a quarterly report compares consecutive quarters, saves a PDF, and emails it", async () => {
  const { app, client, deps } = setup();
  const baseline = await client.runSimulation({ body: { persist: false, seed: 41 } });
  const previous = await client.runSimulation({ body: { persist: false, seed: 41 } });
  const current = await client.runSimulation({
    body: {
      persist: false,
      seed: 41,
      whatIf: { monthlySavingsDeltaCents: 50_000, purchaseAmountCents: 0, eventShifts: [] },
    },
  });
  await deps.docs.saveSimulationRun({
    ...baseline,
    id: "run_2026_q1",
    createdAt: "2026-02-15T12:00:00.000Z",
    persisted: true,
  });
  await deps.docs.saveSimulationRun({
    ...previous,
    id: "run_2026_q2",
    createdAt: "2026-05-15T12:00:00.000Z",
    persisted: true,
  });
  await deps.docs.saveSimulationRun({
    ...current,
    id: "run_2026_q3",
    createdAt: "2026-08-15T12:00:00.000Z",
    persisted: true,
  });

  const report = await client.generateReport({ body: { quarter: "2026-Q3", email: true } });
  assert.equal(report.previousQuarter, "2026-Q2");
  assert.deepEqual(
    report.evidence.map((item) => item.quarter),
    ["2026-Q2", "2026-Q3"],
  );
  assert.ok(report.largestChange);
  assert.match(report.largestChange.cause, /savings scenario changed/);
  assert.equal(report.narrativeSource, "template");
  assert.ok(report.visuals.accountAllocation.length > 0);
  assert.deepEqual(
    report.visuals.spendingTrend.map((point) => point.quarter),
    ["2026-Q2", "2026-Q3"],
  );
  assert.equal(report.visuals.goalComparisons.length, current.goalOutcomes.length);
  assert.equal(report.visuals.goalPathways.length, current.goalOutcomes.length);
  assert.equal(report.visuals.suggestions.length, current.goalOutcomes.length);
  assert.ok(
    report.visuals.monthlyBreakdown.every(
      (month) => month.incomeCents === 0 && month.spendingCents === 0,
    ),
  );
  assert.ok(report.visuals.goalPathways.every((goal) => goal.points.length >= 2));
  assert.equal(report.pdf.status, "ready");
  assert.equal(report.email.status, "sent");
  assert.deepEqual(
    (await client.listReports()).map((item) => item.quarter),
    ["2026-Q3", "2026-Q2", "2026-Q1"],
  );

  const pdf = await app.request(`/v1/reports/quarterly/${report.id}/pdf?token=demo-token`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
});

test("a first-quarter report generates without a previous simulation", async () => {
  const { client, deps } = setup();
  const current = await client.runSimulation({ body: { persist: false, seed: 42 } });
  await deps.docs.saveSimulationRun({
    ...current,
    id: "run_first_quarter",
    createdAt: "2026-02-15T12:00:00.000Z",
    persisted: true,
  });

  const report = await client.generateReport({ body: { quarter: "2026-Q1", email: false } });
  assert.equal(report.previousQuarter, null);
  assert.equal(report.largestChange, null);
  assert.deepEqual(report.evidence.map((item) => item.quarter), ["2026-Q1"]);
  assert.deepEqual(report.visuals.spendingTrend.map((point) => point.quarter), ["2026-Q1"]);
  assert.equal(report.visuals.goalComparisons.length, 0);
  assert.equal(report.visuals.suggestions.length, current.goalOutcomes.length);
  assert.equal(report.pdf.status, "ready");
});

test("a saved email schedule can send on demand and records the outcome", async () => {
  const { client } = setup();
  await client.loadDemoProfile();
  const report = await client.generateReport({ body: { email: false } });
  const schedule = await client.updateEmailSchedule({
    body: {
      enabled: true,
      frequency: "monthly",
      recipientEmail: "scheduled@example.com",
    },
  });
  assert.equal(schedule.enabled, true);
  assert.ok(schedule.nextScheduledAt);

  const result = await client.triggerScheduledEmail();
  assert.equal(result.success, true);
  assert.equal(result.report?.id, report.id);
  assert.equal(result.log?.recipient, "scheduled@example.com");
  assert.equal(result.log?.status, "success");
  const [log] = await client.listEmailScheduleLogs();
  assert.equal(log?.id, result.log?.id);
  assert.equal((await client.getEmailSchedule())?.lastStatus, "success");
});

test("an unmatched life event sentence returns the supported types", async () => {
  const { client } = setup();
  const result = await client.parseLifeEvent({ body: { text: "we adopted a llama" } });
  assert.equal(result.matched, false);
  assert.equal((await client.listLifeEvents()).length, 0);
});

test("CORS allows listed origins and wildcard previews, and nothing else", async () => {
  const allow = originMatcher("http://localhost:3000, https://finvantage-web-*.vercel.app");
  assert.ok(allow("http://localhost:3000"));
  assert.ok(allow("https://finvantage-web-git-feature-team.vercel.app"));
  assert.ok(!allow("https://evil.example"));
  assert.ok(!allow("https://finvantage-web-x.vercel.app.evil.example"));
  assert.ok(!allow("https://finvantage-web-a.b.vercel.app"), "a wildcard spans one label only");

  const app = createApp(createDeps({}), { WEB_ORIGIN: "https://web.example" });
  const preflight = (origin: string) =>
    app.request("/v1/me", {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "GET" },
    });
  assert.equal(
    (await preflight("https://web.example")).headers.get("access-control-allow-origin"),
    "https://web.example",
  );
  assert.equal((await preflight("https://evil.example")).headers.get("access-control-allow-origin"), null);
});

test("the bucket summary splits this month's spending into Needs, Wants and Savings", async () => {
  const { client, deps } = setup();
  const before = await client.getBucketSummary();
  assert.deepEqual(before.split, { needs: 0.5, wants: 0.3, savings: 0.2 });
  assert.deepEqual(before.buckets.map((b) => b.bucket), ["needs", "wants", "savings"]);
  const needs = before.buckets[0]!;
  assert.equal(needs.targetCents, Math.round(before.incomeCents * 0.5));

  const [account] = await client.listAccounts();
  const add = (category: string, subcategory: string | null, amountCents: number) =>
    client.addTransaction({
      body: { accountId: account!.id, date: deps.today(), amountCents, merchant: "Test", category, subcategory },
    });
  const coffee = await add("dining_out", "dining_out.coffee", -1_250);
  assert.equal(coffee.subcategory, "dining_out.coffee");
  await add("transfers", "transfers.credit_card_payment", -50_000);
  // A subcategory from another category is dropped rather than saved.
  const mismatched = await add("groceries", "dining_out.coffee", -500);
  assert.equal(mismatched.subcategory, null);

  const after = await client.getBucketSummary();
  const wants = (s: typeof after) => s.buckets.find((b) => b.bucket === "wants")!.spentCents;
  const total = (s: typeof after) => s.buckets.reduce((sum, b) => sum + b.spentCents, 0);
  assert.equal(wants(after) - wants(before), 1_250);
  // The credit card payment is a transfer, so only the coffee and the groceries count.
  assert.equal(total(after) - total(before), 1_750);
});

test("each user can change their split, and it must add up to 100%", async () => {
  const { app, client } = setup();
  const split = await client.updateSpendingSplit({ body: { needs: 0.6, wants: 0.2, savings: 0.2 } });
  assert.deepEqual(split, { needs: 0.6, wants: 0.2, savings: 0.2 });
  assert.deepEqual((await client.getBucketSummary()).split, { needs: 0.6, wants: 0.2, savings: 0.2 });
  const res = await app.request("/v1/spending/split", {
    method: "PATCH",
    headers: { authorization: "Bearer demo-token", "content-type": "application/json" },
    body: JSON.stringify({ needs: 0.5, wants: 0.5, savings: 0.5 }),
  });
  assert.equal(res.status, 400);
});

test("the category list includes every default, with buckets", async () => {
  const { client } = setup();
  const categories = await client.listSpendingCategories();
  assert.ok(categories.some((c) => c.id === "dining_out" && c.bucket === "wants" && c.parentId === null));
  assert.ok(categories.some((c) => c.id === "dining_out.coffee" && c.parentId === "dining_out"));
});

/* ─── Spending module: categories, budgets, rules, recurring ──────────────── */

/** Same request with a status, for the error cases the typed client throws on. */
async function raw(app: ReturnType<typeof setup>["app"], method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: { authorization: "Bearer demo-token", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as { error?: { code: string } } };
}

test("users can add their own categories up to three levels deep", async () => {
  const { app, client } = setup();
  const walmart = await client.createSpendingCategory({ body: { parentId: "shopping.superstores", label: "Walmart" } });
  assert.match(walmart.id, /^shopping\.superstores\.c[0-9a-f]{8}$/);
  assert.equal(walmart.bucket, "wants");
  assert.equal(walmart.custom, true);
  const kids = await client.createSpendingCategory({ body: { parentId: "shopping", label: "Kids' Clothes", bucket: "needs" } });
  assert.equal(kids.bucket, "needs");

  assert.equal((await raw(app, "POST", "/v1/spending/categories", { parentId: walmart.id, label: "Too Deep" })).json.error?.code, "too_deep");
  assert.equal((await raw(app, "POST", "/v1/spending/categories", { parentId: "shopping.superstores", label: "walmart" })).status, 409);
  assert.equal((await raw(app, "POST", "/v1/spending/categories", { parentId: "nope", label: "X" })).status, 404);

  const list = await client.listSpendingCategories();
  const at = (id: string) => list.findIndex((c) => c.id === id);
  // Custom categories sit right under their parent in display order.
  assert.ok(at(walmart.id) > at("shopping.superstores") && at(walmart.id) < at("shopping.discount_stores"));
});

test("default categories can be renamed, hidden and moved between buckets, but not deleted", async () => {
  const { app, client } = setup();
  const renamed = await client.updateSpendingCategory({ params: { id: "dining_out" }, body: { label: "Eating Out" } });
  assert.equal(renamed.label, "Eating Out");
  const hidden = await client.updateSpendingCategory({ params: { id: "entertainment.gambling" }, body: { hidden: true } });
  assert.equal(hidden.hidden, true);

  // Moving Home & Pets to Needs carries its subcategories with it.
  await client.updateSpendingCategory({ params: { id: "home_pets" }, body: { bucket: "needs" } });
  const list = await client.listSpendingCategories();
  assert.equal(list.find((c) => c.id === "home_pets.vet")?.bucket, "needs");

  assert.equal((await raw(app, "PATCH", "/v1/spending/categories/transfers", { bucket: "wants" })).json.error?.code, "excluded_bucket");
  assert.equal((await raw(app, "DELETE", "/v1/spending/categories/groceries")).json.error?.code, "default_category");
});

test("deleting a custom category moves its transactions, rules and budgets up to the parent", async () => {
  const { client, deps } = setup();
  const target = await client.createSpendingCategory({ body: { parentId: "shopping.superstores", label: "Target" } });
  const [account] = await client.listAccounts();
  const tx = await client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents: -4_200, merchant: "Target #88" } });
  await client.recategorizeTransaction({ params: { id: tx.id }, body: { categoryId: target.id } });
  await client.createCategoryRule({ body: { merchantContains: "target", categoryId: target.id } });
  await client.setBudget({ body: { category: target.id, monthlyLimitCents: 10_000 } });

  const result = await client.deleteSpendingCategory({ params: { id: target.id } });
  assert.equal(result.movedTransactions, 1);
  const moved = (await client.listTransactions({ query: { limit: 500 } })).find((t) => t.id === tx.id);
  assert.equal(moved?.subcategory, "shopping.superstores");
  assert.equal((await client.listCategoryRules())[0]?.categoryId, "shopping.superstores");
  assert.ok(!(await client.listBudgets()).some((b) => b.category === target.id));
});

test("budgets report spending, pace and a suggestion, and work on subcategories", async () => {
  const { app, client, deps } = setup();
  deps.today = () => "2026-11-10";
  const budgets = await client.listBudgets();
  assert.ok(budgets.some((b) => b.category === "groceries"), "demo budgets are the starting point");

  const [account] = await client.listAccounts();
  await client.addTransaction({
    body: { accountId: account!.id, date: "2026-11-09", amountCents: -3_000, merchant: "Bean There", category: "dining_out", subcategory: "dining_out.coffee" },
  });
  const coffee = await client.setBudget({ body: { category: "dining_out.coffee", monthlyLimitCents: 5_000 } });
  assert.equal(coffee.spentCents, 3_000);
  assert.equal(coffee.remainingCents, 2_000);
  // $30 in 10 days heads for $90 in a 30-day month, over the $50 limit.
  assert.equal(coffee.projectedCents, 9_000);
  assert.equal(coffee.status, "at_risk");

  const tight = await client.setBudget({ body: { category: "dining_out.coffee", monthlyLimitCents: 2_000 } });
  assert.equal(tight.status, "over");
  assert.equal((await client.listBudgets()).filter((b) => b.category === "dining_out.coffee").length, 1);

  assert.equal((await raw(app, "POST", "/v1/budgets", { category: "income", monthlyLimitCents: 100 })).json.error?.code, "excluded_budget");
  await client.deleteBudget({ params: { category: "dining_out.coffee" } });
  assert.equal((await raw(app, "DELETE", "/v1/budgets/dining_out.coffee")).status, 404);
});

test("merchant rules re-categorise past transactions and new ones without a category", async () => {
  const { client, deps } = setup();
  const walmart = await client.createSpendingCategory({ body: { parentId: "shopping.superstores", label: "Walmart" } });
  const [account] = await client.listAccounts();
  const old = await client.addTransaction({
    body: { accountId: account!.id, date: deps.today(), amountCents: -2_500, merchant: "WALMART SUPERCENTER", category: "groceries" },
  });

  const { rule, updatedTransactions } = await client.createCategoryRule({ body: { merchantContains: "Walmart", categoryId: walmart.id } });
  assert.equal(updatedTransactions, 1);
  const after = (await client.listTransactions({ query: { limit: 500 } })).find((t) => t.id === old.id);
  assert.deepEqual([after?.category, after?.subcategory], ["shopping", walmart.id]);

  const fresh = await client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents: -900, merchant: "Walmart #4410" } });
  assert.equal(fresh.subcategory, walmart.id);
  // An explicit category on a new transaction wins over the rule.
  const chosen = await client.addTransaction({
    body: { accountId: account!.id, date: deps.today(), amountCents: -900, merchant: "Walmart #4410", category: "groceries" },
  });
  assert.equal(chosen.category, "groceries");

  await client.deleteCategoryRule({ params: { id: rule.id } });
  assert.equal((await client.listCategoryRules()).length, 0);
});

test("a transaction can be moved to any category, or cleared", async () => {
  const { app, client, deps } = setup();
  const [account] = await client.listAccounts();
  const tx = await client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents: -1_000, merchant: "Somewhere" } });
  const moved = await client.recategorizeTransaction({ params: { id: tx.id }, body: { categoryId: "travel.lodging" } });
  assert.deepEqual([moved.category, moved.subcategory], ["travel", "travel.lodging"]);
  const cleared = await client.recategorizeTransaction({ params: { id: tx.id }, body: { categoryId: null } });
  assert.deepEqual([cleared.category, cleared.subcategory], [null, null]);
  assert.equal((await raw(app, "PATCH", `/v1/transactions/${tx.id}/category`, { categoryId: "made.up" })).status, 404);
});

test("recurring charges and bills come from the bank's streams and due dates", async () => {
  const { client, deps } = setup();
  deps.today = () => "2026-11-20";
  const recurring = await client.listRecurring();
  assert.ok(recurring.length > 0 && recurring.every((r) => r.source === "bank"));
  assert.equal(recurring.find((r) => r.merchant === "StreamFlix")?.category, "entertainment.streaming");

  const bills = await client.listUpcomingBills();
  const names = bills.map((b) => b.merchant);
  // Within 14 days: the card and mortgage due dates, and streams with no due date of their own.
  assert.ok(names.includes("Cash Rewards Card") && names.includes("Condo Mortgage"), names.join(", "));
  assert.ok(names.includes("Demo Auto Finance") && names.includes("StreamFlix"), names.join(", "));
  // The mortgage stream duplicates the mortgage due date, so it is left out.
  assert.ok(!names.includes("Demo Mortgage Servicing"), names.join(", "));
  // Past the 14-day window.
  assert.ok(!names.includes("Tunewave"), names.join(", "));
  assert.deepEqual(bills.map((b) => b.nextDate), [...bills.map((b) => b.nextDate)].sort());
});

test("top expenses are this month's largest purchases, without transfers", async () => {
  const { client, deps } = setup();
  const [account] = await client.listAccounts();
  await client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents: -900_000, merchant: "Card Payment", category: "transfers" } });
  await client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents: -800_000, merchant: "Big TV", category: "shopping" } });
  const top = await client.listTopExpenses({ query: { limit: 10 } });
  assert.equal(top[0]?.merchant, "Big TV");
  assert.ok(!top.some((t) => t.merchant === "Card Payment"));
  assert.ok(top.length <= 10);
  assert.deepEqual(top.map((t) => t.amountCents), [...top.map((t) => t.amountCents)].sort((a, b) => a - b));
});
