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

test("COPILOT_GEMINI_MERCHANTS limits model calls to the listed merchants", async () => {
  const { client, deps } = setup({ COPILOT_GEMINI_MERCHANTS: "Amazon, Best Buy" });
  let calls = 0;
  deps.llm = {
    provider: "test",
    generate: async () => {
      calls += 1;
      throw new Error("model down");
    },
  };
  const unlisted = await client.evaluateCopilot({ body: rental });
  assert.equal(calls, 0, "an unlisted merchant must not call the model");
  assert.equal(unlisted.status === "ok" && unlisted.card.source, "template");

  const listed = await client.evaluateCopilot({ body: { ...rental, merchant: "amazon" } });
  assert.equal(calls, 1, "a listed merchant calls the model, matched case-insensitively");
  assert.equal(listed.status === "ok" && listed.card.source, "template", "and still falls back when it fails");
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
