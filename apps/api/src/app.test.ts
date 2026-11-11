import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiError,
  createApiClient,
  readClaims,
  type ApiClient,
  type CopilotContext,
  type NewLifeScenario,
} from "@finvantage/contracts";
import { DEMO_USER_ID } from "@finvantage/data";
import { createApp, demoTokenMayCall, originMatcher } from "./app";
import { RateLimiter } from "./rate-limit";
import { createDeps } from "./deps";
import { monthlyCashFlow } from "./reporting/cashflow";

/** A real client against the real app, in process. Every call validates against the contracts. */
function setup(env: Record<string, string> = {}) {
  const deps = createDeps({ REPORT_OUTPUT_DIR: "/tmp/finvantage-report-tests", ...env });
  const app = createApp(deps, {});
  const clientFor = (token: string): ApiClient =>
    createApiClient({
      baseUrl: "http://test",
      token,
      fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
    });
  // The shared demo token is read-only now, so tests that change the demo user's data sign in as
  // it with a real token. The fixture IDs stay the same, because the demo user keeps them.
  const demoSession = deps.auth.issue({ userId: DEMO_USER_ID, name: null, email: null });
  const asDemo = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await demoSession}`);
    return app.request(path, { ...init, headers });
  };
  const client = createApiClient({
    baseUrl: "http://test",
    token: "set-by-asDemo",
    fetch: ((url: string, init: RequestInit) => asDemo(url, init)) as typeof fetch,
  });
  return { app, asDemo, client, clientFor, deps };
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

/* ─── Security review W1 and W5: the shared demo token and guest sessions ──── */

async function statusOf(call: Promise<unknown>): Promise<number> {
  try {
    await call;
    return 200;
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
}

test("W1: the shared demo token is read-only, apart from the extension's Copilot calls", async () => {
  const { app, clientFor } = setup();
  const demo = clientFor("demo-token");
  const goals = await demo.listGoals();
  assert.ok(goals.length > 0, "the demo token can still read");

  // The attack from the review: a public-token visitor plants a goal every other visitor reads.
  const { id: _id, userId: _userId, ...planted } = goals[0]!;
  const res = await app.request("/v1/goals", {
    method: "POST",
    headers: { authorization: "Bearer demo-token", "content-type": "application/json" },
    body: JSON.stringify({ ...planted, name: "Planted by another visitor", linkedAccountId: null }),
  });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "demo_read_only");
  assert.equal((await demo.listGoals()).length, goals.length, "nothing was written");

  // The extension, signed out, still gets Copilot cards.
  assert.equal(await statusOf(demo.evaluateCopilot({ body: rental })), 200);

  assert.ok(demoTokenMayCall("GET", "/v1/goals"));
  assert.ok(demoTokenMayCall("POST", "/v1/copilot/evaluate"));
  assert.ok(demoTokenMayCall("POST", "/v1/copilot/events/evt_1/action"));
  for (const [method, path] of [
    ["POST", "/v1/goals"],
    ["PATCH", "/v1/goals/goal_1"],
    ["DELETE", "/v1/goals/goal_1"],
    ["POST", "/v1/transactions"],
    ["POST", "/v1/life-events"],
    ["POST", "/v1/advisory/conversations"],
    ["POST", "/v1/reports/schedule"],
    ["POST", "/v1/copilot/evaluate/extra"],
    ["POST", "/v1/copilot/events/evt_1/action/extra"],
  ] as const) {
    assert.ok(!demoTokenMayCall(method, path), `${method} ${path} must be refused`);
  }
});

test("W1: each guest session gets a private demo copy, so one visitor's records never reach another", async () => {
  const { client: demoUser, clientFor } = setup();
  const anon = clientFor("");
  const first = await anon.startGuestSession();
  const second = await anon.startGuestSession();
  assert.ok(first.user.id.startsWith("guest_"));
  assert.notEqual(first.user.id, second.user.id);
  const visitorA = clientFor(first.token);
  const visitorB = clientFor(second.token);

  // Both start from the full demo profile.
  const demoGoals = await demoUser.listGoals();
  assert.equal((await visitorA.listGoals()).length, demoGoals.length);

  // Visitor A plants a goal. Only visitor A can see it.
  const { id: _id, userId: _userId, ...template } = demoGoals[0]!;
  const planted = await visitorA.createGoal({
    body: { ...template, name: "Planted by visitor A", linkedAccountId: null },
  });
  assert.ok((await visitorA.listGoals()).some((g) => g.id === planted.id));
  for (const other of [visitorB, demoUser, clientFor("demo-token")]) {
    assert.ok(!(await other.listGoals()).some((g) => g.name === "Planted by visitor A"));
  }

  // A guest is a throwaway copy, not an account: short-lived, and it can't link a bank.
  const claims = readClaims(first.token)!;
  assert.equal(claims.guest, true);
  assert.ok(claims.exp - Date.now() / 1000 <= 24 * 60 * 60 + 5, "a guest token lasts a day at most");
  assert.equal(await statusOf(visitorA.createBankLinkToken()), 403);
});

test("W5: Advisor conversations are private to each guest session", async () => {
  const { clientFor } = setup();
  const anon = clientFor("");
  const visitorA = clientFor((await anon.startGuestSession()).token);
  const visitorB = clientFor((await anon.startGuestSession()).token);

  const chat = await visitorA.createAdvisorConversation({ body: {} });
  assert.ok((await visitorA.listAdvisorConversations()).some((c) => c.id === chat.id));
  assert.equal((await visitorB.listAdvisorConversations()).length, 0);
  assert.equal(await statusOf(visitorB.getAdvisorConversation({ params: { id: chat.id } })), 404);
});

/* ─── Security review W3: the server decides who receives a report ───────── */

/** A mailer that records each recipient instead of sending, so tests can see where mail would go. */
function recordMail(deps: ReturnType<typeof setup>["deps"]): string[] {
  const sentTo: string[] = [];
  deps.mail = {
    sendReport: async ({ to }: { to: string }) => {
      sentTo.push(to);
      return { messageId: `test-${sentTo.length}` };
    },
  } as unknown as typeof deps.mail;
  return sentTo;
}

async function signedUpReport(clientFor: ReturnType<typeof setup>["clientFor"], email: string) {
  const { token } = await clientFor("").signUp({ body: { displayName: "Owner", email, password: "s3cret-pass" } });
  const client = clientFor(token);
  return { client, report: await client.generateReport({ body: { email: false } }) };
}

test("W3: a report can't be emailed or scheduled to an address the account doesn't own", async () => {
  const { clientFor, deps } = setup();
  const sentTo = recordMail(deps);
  const { client, report } = await signedUpReport(clientFor, "owner@example.com");

  // The attack from the review: name a stranger as the recipient.
  const stranger = "someone-else@example.com";
  assert.equal(await statusOf(client.emailReport({ params: { id: report.id }, body: { to: stranger } })), 403);
  assert.equal(
    await statusOf(client.updateEmailSchedule({ body: { enabled: true, frequency: "monthly", recipientEmail: stranger } })),
    403,
  );
  assert.deepEqual(sentTo, [], "nothing was sent");

  // The account's own address still works, named or not, ignoring case.
  assert.equal((await client.emailReport({ params: { id: report.id }, body: { to: "Owner@Example.com" } })).email.status, "sent");
  assert.equal((await client.emailReport({ params: { id: report.id }, body: undefined })).email.status, "sent");
  assert.deepEqual(sentTo, ["owner@example.com", "owner@example.com"]);
});

test("W3: guests and the shared demo user can't email reports at all", async () => {
  const { app, asDemo, clientFor, deps } = setup();
  const sentTo = recordMail(deps);
  const guest = clientFor((await clientFor("").startGuestSession()).token);
  const report = await guest.generateReport({ body: { email: true } });
  assert.equal(report.email.status, "failed", "generating still works; only the email is skipped");
  assert.equal(report.email.error, "Sign in to email reports.");
  assert.equal(await statusOf(guest.emailReport({ params: { id: report.id }, body: undefined })), 403);
  assert.equal(
    await statusOf(guest.updateEmailSchedule({ body: { enabled: true, frequency: "monthly", recipientEmail: "jordan@example.com" } })),
    403,
  );

  // The demo user, through a signed session or the public token.
  const demoReport = (await (await asDemo("/v1/reports/quarterly", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: false }) })).json()) as { id: string };
  assert.equal((await asDemo(`/v1/reports/quarterly/${demoReport.id}/email`, { method: "POST" })).status, 403);
  const viaToken = await app.request(`/v1/reports/quarterly/${demoReport.id}/email`, {
    method: "POST",
    headers: { authorization: "Bearer demo-token", "content-type": "application/json" },
    body: JSON.stringify({ to: "someone-else@example.com" }),
  });
  assert.equal(viaToken.status, 403);
  assert.deepEqual(sentTo, []);
});

test("W3: the operator's REPORT_EMAIL_OVERRIDE wins over the account and any request", async () => {
  const { clientFor, deps } = setup({ REPORT_EMAIL_OVERRIDE: "demo-inbox@example.com" });
  const sentTo = recordMail(deps);
  const { client, report } = await signedUpReport(clientFor, "owner@example.com");
  assert.equal(await statusOf(client.emailReport({ params: { id: report.id }, body: { to: "someone-else@example.com" } })), 403);
  await client.emailReport({ params: { id: report.id }, body: undefined });
  assert.deepEqual(sentTo, ["demo-inbox@example.com"]);
});

test("W3: a scheduled send looks the recipient up again, so a stored stranger's address is never used", async () => {
  const { clientFor, deps } = setup();
  const sentTo = recordMail(deps);
  const { client } = await signedUpReport(clientFor, "owner@example.com");
  const saved = await client.updateEmailSchedule({ body: { enabled: true, frequency: "monthly", recipientEmail: "owner@example.com" } });
  // A schedule saved before the fix could still hold a stranger's address.
  await deps.docs.saveEmailSchedule(saved.userId, { ...saved, recipientEmail: "someone-else@example.com" });
  assert.equal((await client.triggerScheduledEmail()).success, true);
  assert.deepEqual(sentTo, ["owner@example.com"]);
});

/* ─── Security review W4: request limits ─────────────────────────────────── */

test("W4: login is limited per address, so passwords can't be guessed at speed", async () => {
  const { app, clientFor } = setup();
  await clientFor("").signUp({ body: { displayName: "Sam", email: "sam@example.com", password: "s3cret-pass" } });
  const login = (password: string, ip = "203.0.113.7") =>
    app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email: "sam@example.com", password }),
    });
  for (let i = 0; i < 10; i++) assert.equal((await login(`guess-${i}-pass`)).status, 401);
  const blocked = await login("guess-10-pass");
  assert.equal(blocked.status, 429);
  assert.equal(((await blocked.json()) as { error: { code: string } }).error.code, "rate_limited");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await login("s3cret-pass")).status, 429, "even the right password waits out the window");
  assert.equal((await login("s3cret-pass", "198.51.100.9")).status, 200, "another address is unaffected");
});

test("W4: guest sessions are limited per address, so memory can't be filled with demo copies", async () => {
  const { app } = setup();
  const guest = () => app.request("/auth/guest", { method: "POST", headers: { "x-forwarded-for": "203.0.113.8" } });
  for (let i = 0; i < 30; i++) assert.equal((await guest()).status, 200);
  assert.equal((await guest()).status, 429);
});

test("W4: model routes are limited per user and per address", async () => {
  const { app } = setup();
  const ip = { "x-forwarded-for": "203.0.113.9" };
  const newGuest = async () =>
    ((await (await app.request("/auth/guest", { method: "POST", headers: ip })).json()) as { token: string }).token;
  const parse = (token: string) =>
    app.request("/v1/life-events/parse", {
      method: "POST",
      headers: { ...ip, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "we adopted a llama" }),
    });

  // Per user: 30 a minute.
  const a = await newGuest();
  for (let i = 0; i < 30; i++) assert.equal((await parse(a)).status, 200);
  assert.equal((await parse(a)).status, 429);

  // A new guest gets its own allowance, but the address caps the total at 60 a minute.
  const b = await newGuest();
  for (let i = 0; i < 29; i++) assert.equal((await parse(b)).status, 200);
  assert.equal((await parse(b)).status, 200, "the 60th model call from this address");
  assert.equal((await parse(await newGuest())).status, 429, "a third guest can't multiply the allowance");
});

test("W4: an Advisor message, which can make several model calls, has a tighter limit", async () => {
  const { app, clientFor } = setup();
  const token = (await clientFor("").startGuestSession()).token;
  const chat = await clientFor(token).createAdvisorConversation({ body: {} });
  const send = () =>
    app.request(`/v1/advisory/conversations/${chat.id}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ content: "How are my budgets?" }),
    });
  for (let i = 0; i < 10; i++) assert.notEqual((await send()).status, 429);
  assert.equal((await send()).status, 429);
});

test("W4: everyone on the shared demo token is counted by address, so one caller can't use up everyone's limit", async () => {
  const { app } = setup();
  const evaluate = (ip: string) =>
    app.request("/v1/copilot/evaluate", {
      method: "POST",
      headers: { authorization: "Bearer demo-token", "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(rental),
    });
  for (let i = 0; i < 30; i++) assert.equal((await evaluate("203.0.113.10")).status, 200);
  assert.equal((await evaluate("203.0.113.10")).status, 429);
  assert.equal((await evaluate("198.51.100.11")).status, 200, "another extension user still gets cards");
});

test("W4: a window resets after it ends, and the counter map stays bounded", () => {
  let now = 0;
  const limiter = new RateLimiter(() => now, 3);
  assert.equal(limiter.hit("k", 1, 1_000).allowed, true);
  assert.equal(limiter.hit("k", 1, 1_000).allowed, false);
  assert.equal(limiter.hit("k", 1, 1_000).retryAfterSeconds, 1);
  now = 1_000;
  assert.equal(limiter.hit("k", 1, 1_000).allowed, true, "a new window");
  for (const key of ["a", "b", "c", "d", "e"]) limiter.hit(key, 1, 60_000);
  assert.ok((limiter as unknown as { windows: Map<string, unknown> }).windows.size <= 3);
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

test("the demo profile covers all seven account categories", async () => {
  const { client } = setup();
  const netWorth = await client.getNetWorth();
  assert.equal(netWorth.byCategory.length, 7);
  const accounts = await client.listAccounts();
  const types = new Set(accounts.map((a) => a.type));
  assert.equal(types.size, 8);
});

test("investments open on All and each account matches its balance on the Accounts page", async () => {
  const { client } = setup();
  const [overview, accounts] = await Promise.all([client.getInvestments(), client.listAccounts()]);
  assert.equal(overview.mocked, true);
  assert.deepEqual(overview.views.map((v) => v.label), ["All", "Roth IRA", "401(k)", "Brokerage"]);

  const invested = accounts.filter((a) => a.type === "ira" || a.type === "brokerage");
  assert.equal(invested.length, 3);
  for (const account of invested) {
    assert.equal(overview.views.find((v) => v.id === account.id)?.totalValueCents, account.balanceCents);
  }
  assert.equal(overview.views[0]!.totalValueCents, invested.reduce((sum, a) => sum + a.balanceCents, 0));
});

test("the older portfolio route reports the same total as the All view", async () => {
  const { client } = setup();
  const [portfolio, overview] = await Promise.all([client.getPortfolio(), client.getInvestments()]);
  const all = overview.views[0]!;
  assert.equal(portfolio.holdings.reduce((sum, h) => sum + h.valueCents, 0) + all.cashCents, all.totalValueCents);
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

test("a baby scenario compares every current goal before saving the event", async () => {
  const { client } = setup();
  const goals = await client.listGoals();
  const existingEvents = await client.listLifeEvents();
  const preview = await client.previewLifeEvent({
    body: {
      event: {
        type: "child",
        date: "2027-06-01",
        recurrence: "recurring",
        dollarImpactCents: -120_000,
        durationMonths: null,
        linkedGoalId: null,
        source: "form",
      },
      seed: 52,
      paths: 2_000,
    },
  });

  assert.equal(preview.before.seed, preview.after.seed);
  assert.equal(preview.before.goalOutcomes.length, goals.length);
  assert.equal(preview.after.goalOutcomes.length, goals.length);
  assert.ok(preview.goalChanges.some((goal) => goal.probabilityHighDelta < 0));
  assert.deepEqual(await client.listLifeEvents(), existingEvents, "preview must not save the drafted event");
});

test("life simulator context reflects the demo user's real goals", async () => {
  const { client } = setup();
  const context = await client.getLifeSimulatorContext();
  const japan = context.goals.find((goal) => goal.id === "goal_japan");
  assert.equal(japan?.kind, "trip");
  assert.equal(japan?.plannedDate, "2027-10-01"); // the goal's own targetDate doubles as its planned trip date
  assert.equal(context.goals.find((goal) => goal.id === "goal_emergency")?.kind, "standard");
  assert.ok(context.freeCashCents > 0);
  assert.ok(
    context.goals.reduce((sum, goal) => sum + goal.monthlyContributionCents, 0) <= context.freeCashCents,
    "the current monthly goal contributions must fit the user's actual free cash",
  );
});

test("life simulator analyze uses the user's current server-side goals and cash flow", async () => {
  const { client } = setup();
  const context = await client.getLifeSimulatorContext();
  const result = await client.analyzeLifeScenario({
    body: {
      eventType: "new_baby",
      customEventName: "",
      startMonth: "2027-03-01",
      monthlyCostCents: 0,
      oneTimeCostCents: 0,
      oneTimeSourceGoalId: context.goals[0]!.id,
      selectedGoalIds: context.goals.map((goal) => goal.id),
      split: Object.fromEntries(context.goals.map((goal) => [goal.id, Math.floor(context.freeCashCents / context.goals.length)])),
      selectedOption: "keep",
      allowOverCommit: false,
    },
  });

  assert.equal(result.asOf, context.asOf);
  assert.deepEqual(result.goals.map((goal) => goal.goalId), context.goals.map((goal) => goal.id));
  assert.equal(result.analysis.freeCashBeforeCents, context.freeCashCents);
});

test("analyze rejects an event dated in the current month", async () => {
  const { client, deps } = setup();
  await assert.rejects(
    client.analyzeLifeScenario({
      body: {
        eventType: "custom",
        customEventName: "Test",
        startMonth: deps.today(),
        monthlyCostCents: 0,
        oneTimeCostCents: 0,
        oneTimeSourceGoalId: "g",
        selectedGoalIds: ["g"],
        split: { g: 0 },
        selectedOption: "keep",
        allowOverCommit: false,
      },
    }),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === "event_not_future",
  );
});

/** A scenario against the demo user's real goals: modest enough to fit their free cash. */
function scenarioBody(overrides: Partial<NewLifeScenario> = {}): NewLifeScenario {
  return {
    name: "New baby plan",
    eventType: "new_baby",
    customEventName: "",
    startMonth: "2027-06-01",
    monthlyCostCents: 20_000,
    oneTimeCostCents: 50_000,
    oneTimeSourceGoalId: "goal_japan",
    selectedGoalIds: ["goal_japan", "goal_emergency", "goal_house", "goal_car"],
    split: { goal_japan: 40_000, goal_emergency: 30_000, goal_house: 20_000, goal_car: 10_000 },
    selectedOption: "keep",
    allowOverCommit: false,
    ...overrides,
  };
}

test("scenarios can be created, listed, reopened, updated, and deleted", async () => {
  const { client } = setup();
  const created = await client.createLifeScenario({ body: scenarioBody() });
  assert.equal(created.status, "saved");
  assert.ok((await client.listLifeScenarios()).some((s) => s.id === created.id));
  assert.equal((await client.getLifeScenario({ params: { id: created.id } })).name, "New baby plan");

  const updated = await client.updateLifeScenario({ params: { id: created.id }, body: scenarioBody({ name: "Renamed plan" }) });
  assert.equal(updated.name, "Renamed plan");

  assert.deepEqual(await client.deleteLifeScenario({ params: { id: created.id } }), { deleted: true });
  await assert.rejects(client.getLifeScenario({ params: { id: created.id } }), (error: unknown) => error instanceof ApiError && error.status === 404);
});

test("Life Events exports a PDF from current server data without saving the scenario", async () => {
  const { client } = setup();
  const { name: _name, ...input } = scenarioBody();
  const report = await client.exportLifeScenarioPdf({ body: input });
  const pdf = Buffer.from(report.base64, "base64");
  assert.match(report.filename, /new-baby-comparison\.pdf$/);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await client.listLifeScenarios()).length, 0, "downloading must not save the scenario");
});

test("apply drafts a scenario without touching real goals; confirm changes them; undo reverts", async () => {
  const { client } = setup();
  const before = await client.listGoals();
  const japanBefore = before.find((g) => g.id === "goal_japan")!;

  const created = await client.createLifeScenario({ body: scenarioBody() });
  const applied = await client.applyLifeScenario({ params: { id: created.id } });
  assert.equal(applied.scenario.status, "draft_applied");
  assert.deepEqual(await client.listGoals(), before, "apply must not change real goals");

  const confirmed = await client.confirmLifeScenario({ params: { id: created.id } });
  assert.equal(confirmed.scenario.status, "applied");
  assert.ok(confirmed.lifeEventIds.length >= 1);
  assert.ok(confirmed.updatedGoalIds.length >= 1);
  const afterConfirm = await client.listGoals();
  const japanAfterConfirm = afterConfirm.find((g) => g.id === "goal_japan")!;
  assert.notEqual(japanAfterConfirm.targetDate, japanBefore.targetDate, "a scenario that delays the trip goal should move its targetDate");

  // Confirming again is a no-op: same ids, no duplicate life events.
  const confirmedAgain = await client.confirmLifeScenario({ params: { id: created.id } });
  assert.deepEqual(confirmedAgain.lifeEventIds, confirmed.lifeEventIds);
  assert.deepEqual(confirmedAgain.updatedGoalIds, confirmed.updatedGoalIds);

  const undone = await client.undoLifeScenario({ params: { id: created.id } });
  assert.equal(undone.scenario.status, "saved");
  const afterUndo = await client.listGoals();
  // updateGoal always re-normalizes `status` from the balance on every write (pre-existing
  // behavior, not scoped to this feature), so compare targetDate specifically rather than the
  // whole record.
  for (const goal of before) {
    assert.equal(afterUndo.find((g) => g.id === goal.id)?.targetDate, goal.targetDate, `${goal.name}'s targetDate should be restored`);
  }
  const events = await client.listLifeEvents();
  for (const id of confirmed.lifeEventIds) assert.ok(!events.some((e) => e.id === id), "undo must remove the life events confirm created");
});

test("a scenario is scoped to the user who created it", async () => {
  const { client, clientFor } = setup();
  const created = await client.createLifeScenario({ body: scenarioBody() });
  const { token } = await clientFor("").signUp({ body: { displayName: "Other", email: "other-sim@example.com", password: "s3cret-pass" } });
  const other = clientFor(token);
  await assert.rejects(other.getLifeScenario({ params: { id: created.id } }), (error: unknown) => error instanceof ApiError && error.status === 404);
  await assert.rejects(other.applyLifeScenario({ params: { id: created.id } }), (error: unknown) => error instanceof ApiError && error.status === 404);
  assert.ok(!(await other.listLifeScenarios()).some((s) => s.id === created.id));
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
  assert.equal(result.simulationPath, `/life-events?copilotEvent=${result.eventId}`);
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

test("a quarterly report compares consecutive quarters and saves a PDF; the shared demo user's copy is not emailed", async () => {
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
  // The demo profile's own transactions for the quarter, transfers left out.
  const expectedMonths = monthlyCashFlow(await client.listTransactions({ query: { limit: 500 } }), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(
    report.visuals.monthlyBreakdown.map((m) => [m.monthKey, m.incomeCents, m.spendingCents]),
    expectedMonths.map((m) => [m.monthKey, m.incomeCents, m.spendingCents]),
  );
  assert.ok(report.visuals.goalPathways.every((goal) => goal.points.length >= 2));
  assert.equal(report.pdf.status, "ready");
  // W3: the demo user is a shared copy, not an account, so its reports aren't emailed. Emailing an
  // account's report is covered by the W3 tests.
  assert.equal(report.email.status, "failed");
  assert.equal(report.email.error, "Sign in to email reports.");
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
  // A signed-in account schedules reports to its own address (W3: no other recipient is allowed).
  const { clientFor } = setup();
  const { token } = await clientFor("").signUp({
    body: { displayName: "Scheduled", email: "scheduled@example.com", password: "s3cret-pass" },
  });
  const client = clientFor(token);
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
  const { asDemo, client } = setup();
  const split = await client.updateSpendingSplit({ body: { needs: 0.6, wants: 0.2, savings: 0.2 } });
  assert.deepEqual(split, { needs: 0.6, wants: 0.2, savings: 0.2 });
  assert.deepEqual((await client.getBucketSummary()).split, { needs: 0.6, wants: 0.2, savings: 0.2 });
  const res = await asDemo("/v1/spending/split", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
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
async function raw(asDemo: ReturnType<typeof setup>["asDemo"], method: string, path: string, body?: unknown) {
  const res = await asDemo(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as { error?: { code: string } } };
}

test("users can add their own categories up to three levels deep", async () => {
  const { asDemo, client } = setup();
  const walmart = await client.createSpendingCategory({ body: { parentId: "shopping.superstores", label: "Walmart" } });
  assert.match(walmart.id, /^shopping\.superstores\.c[0-9a-f]{8}$/);
  assert.equal(walmart.bucket, "wants");
  assert.equal(walmart.custom, true);
  const kids = await client.createSpendingCategory({ body: { parentId: "shopping", label: "Kids' Clothes", bucket: "needs" } });
  assert.equal(kids.bucket, "needs");

  assert.equal((await raw(asDemo, "POST", "/v1/spending/categories", { parentId: walmart.id, label: "Too Deep" })).json.error?.code, "too_deep");
  assert.equal((await raw(asDemo, "POST", "/v1/spending/categories", { parentId: "shopping.superstores", label: "walmart" })).status, 409);
  assert.equal((await raw(asDemo, "POST", "/v1/spending/categories", { parentId: "nope", label: "X" })).status, 404);

  const list = await client.listSpendingCategories();
  const at = (id: string) => list.findIndex((c) => c.id === id);
  // Custom categories sit right under their parent in display order.
  assert.ok(at(walmart.id) > at("shopping.superstores") && at(walmart.id) < at("shopping.discount_stores"));
});

test("default categories can be renamed, hidden and moved between buckets, but not deleted", async () => {
  const { asDemo, client } = setup();
  const renamed = await client.updateSpendingCategory({ params: { id: "dining_out" }, body: { label: "Eating Out" } });
  assert.equal(renamed.label, "Eating Out");
  const hidden = await client.updateSpendingCategory({ params: { id: "entertainment.gambling" }, body: { hidden: true } });
  assert.equal(hidden.hidden, true);

  // Moving Home & Pets to Needs carries its subcategories with it.
  await client.updateSpendingCategory({ params: { id: "home_pets" }, body: { bucket: "needs" } });
  const list = await client.listSpendingCategories();
  assert.equal(list.find((c) => c.id === "home_pets.vet")?.bucket, "needs");

  assert.equal((await raw(asDemo, "PATCH", "/v1/spending/categories/transfers", { bucket: "wants" })).json.error?.code, "excluded_bucket");
  assert.equal((await raw(asDemo, "DELETE", "/v1/spending/categories/groceries")).json.error?.code, "default_category");
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
  const { asDemo, client, deps } = setup();
  deps.today = () => "2026-11-10";
  const budgets = await client.listBudgets();
  assert.ok(budgets.some((b) => b.category === "groceries"), "demo budgets are the starting point");

  const [account] = await client.listAccounts();
  await client.addTransaction({
    // A subcategory the demo profile has no spending in, so the figures below are this test's alone.
    body: { accountId: account!.id, date: "2026-11-09", amountCents: -3_000, merchant: "Corner Pub", category: "dining_out", subcategory: "dining_out.bars_alcohol" },
  });
  const coffee = await client.setBudget({ body: { category: "dining_out.bars_alcohol", monthlyLimitCents: 5_000 } });
  assert.equal(coffee.spentCents, 3_000);
  assert.equal(coffee.remainingCents, 2_000);
  // $30 in 10 days heads for $90 in a 30-day month, over the $50 limit.
  assert.equal(coffee.projectedCents, 9_000);
  assert.equal(coffee.status, "at_risk");

  const tight = await client.setBudget({ body: { category: "dining_out.bars_alcohol", monthlyLimitCents: 2_000 } });
  assert.equal(tight.status, "over");
  assert.equal((await client.listBudgets()).filter((b) => b.category === "dining_out.bars_alcohol").length, 1);

  assert.equal((await raw(asDemo, "POST", "/v1/budgets", { category: "income", monthlyLimitCents: 100 })).json.error?.code, "excluded_budget");
  await client.deleteBudget({ params: { category: "dining_out.bars_alcohol" } });
  assert.equal((await raw(asDemo, "DELETE", "/v1/budgets/dining_out.bars_alcohol")).status, 404);
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
  const { asDemo, client, deps } = setup();
  const [account] = await client.listAccounts();
  const tx = await client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents: -1_000, merchant: "Somewhere" } });
  const moved = await client.recategorizeTransaction({ params: { id: tx.id }, body: { categoryId: "travel.lodging" } });
  assert.deepEqual([moved.category, moved.subcategory], ["travel", "travel.lodging"]);
  const cleared = await client.recategorizeTransaction({ params: { id: tx.id }, body: { categoryId: null } });
  assert.deepEqual([cleared.category, cleared.subcategory], [null, null]);
  assert.equal((await raw(asDemo, "PATCH", `/v1/transactions/${tx.id}/category`, { categoryId: "made.up" })).status, 404);
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
  assert.ok(names.includes("Fiberlink Internet") && names.includes("StreamFlix"), names.join(", "));
  // The mortgage stream duplicates the mortgage due date, so it is left out.
  assert.ok(!names.includes("Lakeside Home Loans"), names.join(", "));
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

test("the spending breakdown lists this month's spending at each transaction's most specific category", async () => {
  const { client, deps } = setup();
  const walmart = await client.createSpendingCategory({ body: { parentId: "shopping.superstores", label: "Walmart" } });
  const [account] = await client.listAccounts();
  const add = (merchant: string, amountCents: number, category: string, subcategory: string | null) =>
    client.addTransaction({ body: { accountId: account!.id, date: deps.today(), amountCents, merchant, category, subcategory } });
  const tx = await add("Walmart #1", -2_000, "shopping", null);
  await client.recategorizeTransaction({ params: { id: tx.id }, body: { categoryId: walmart.id } });
  await add("Some Store", -700, "shopping", null);
  await add("Card Payment", -90_000, "transfers", null);

  const rows = await client.getSpendingBreakdown();
  const at = (id: string) => rows.find((r) => r.categoryId === id)?.spentCents;
  assert.equal(at(walmart.id), 2_000);
  assert.equal(at("shopping"), 700);
  assert.equal(at("transfers"), undefined);
  assert.deepEqual(rows.map((r) => r.spentCents), [...rows.map((r) => r.spentCents)].sort((a, b) => b - a));
});

test("the income summary totals deposits by month and source, and leaves out transfers", async () => {
  const { client, deps } = setup();
  deps.today = () => "2026-11-10";
  const [account] = await client.listAccounts();
  const deposit = (date: string, amountCents: number, merchant: string, category: string) =>
    client.addTransaction({ body: { accountId: account!.id, date, amountCents, merchant, category } });
  await deposit("2026-11-03", 300_000, "Acme Payroll", "income");
  await deposit("2026-10-03", 300_000, "Acme Payroll", "income");
  await deposit("2026-09-03", 300_000, "Acme Payroll", "income");
  await deposit("2026-08-03", 300_000, "Acme Payroll", "income");
  await deposit("2026-11-05", 50_000, "Savings Transfer", "transfers");
  // A kind of income the demo profile has none of, so its total is this deposit alone.
  await client.addTransaction({ body: { accountId: account!.id, date: "2026-11-04", amountCents: 12_000, merchant: "Room Rental", category: "income", subcategory: "income.rental" } });

  const income = await client.getIncomeSummary();
  assert.equal(income.thisMonthCents >= 300_000, true);
  assert.equal(income.lastMonthCents >= 300_000, true);
  assert.ok(!income.sources.some((s) => s.merchant === "Savings Transfer"));
  const acme = income.sources.find((s) => s.merchant === "Acme Payroll")!;
  assert.ok(acme.deposits >= 4);
  assert.equal(income.trend.length, 6);
  assert.equal(income.debtToIncome.ratio, income.debtToIncome.monthlyDebtCents / income.debtToIncome.monthlyIncomeCents);
  const gig = income.categories.find((c) => c.categoryId === "income.rental");
  assert.equal(gig?.totalCents, 12_000);
  assert.ok(income.categories.some((c) => c.categoryId === "income.other"), "deposits with no subcategory fall under Other Income");
  assert.ok(!income.categories.some((c) => c.categoryId === "transfers"));
  assert.ok(Math.abs(income.categories.reduce((sum, c) => sum + c.share, 0) - 1) < 1e-9);
  assert.ok(income.recent.every((t) => t.amountCents > 0 && t.category === "income"));
  assert.ok(income.recent.length <= 10);
});

test("Copilot events can be deleted one at a time or cleared, only the user's own", async () => {
  const { client } = setup();
  const first = await client.evaluateCopilot({ body: rental });
  const second = await client.evaluateCopilot({ body: { ...rental, priceCents: 150_000 } });
  assert.ok(first.status === "ok" && second.status === "ok");
  if (first.status !== "ok" || second.status !== "ok") return;

  assert.deepEqual(await client.deleteCopilotEvent({ params: { id: first.eventId } }), { deleted: true });
  assert.deepEqual((await client.listCopilotEvents()).map((e) => e.id), [second.eventId]);
  await assert.rejects(client.deleteCopilotEvent({ params: { id: first.eventId } }), /No such Copilot event/);

  assert.deepEqual(await client.clearCopilotEvents(), { deleted: 1 });
  assert.deepEqual(await client.listCopilotEvents(), []);
});

/** A fake model that calls the named tools on its first turn, then gives `answer`. */
function toolCallingLlm(toolCalls: Array<{ name: string; args?: Record<string, unknown> }>, answer: (toolResults: unknown) => string) {
  const requests: Array<{ system: string; tools?: unknown[] }> = [];
  return {
    requests,
    llm: {
      provider: "test",
      generate: async () => { throw new Error("unused"); },
      chat: async (request: { system: string; tools?: unknown[]; messages: Array<{ role: string; results?: unknown }> }) => {
        requests.push({ system: request.system, tools: request.tools });
        const last = request.messages.at(-1);
        if (last?.role === "tool") {
          return { message: { role: "model" as const, text: answer(last.results), functionCalls: [] } };
        }
        return { message: { role: "model" as const, text: null, functionCalls: toolCalls.map((c) => ({ name: c.name, args: c.args ?? {} })) } };
      },
    },
  };
}

test("the Advisor saves conversations and grounds answers in tool results", async () => {
  const { client, deps } = setup();
  const fake = toolCallingLlm([{ name: "get_budgets" }], (results) => {
    const [budget] = (results as Array<{ response: { result: Array<{ category: string; spent: string }> } }>)[0]!.response.result;
    return `Your ${budget!.category} budget shows ${budget!.spent} spent.`;
  });
  deps.llm = fake.llm;

  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "How are my budgets?" } });
  assert.equal(turn.reply.source, "gemini");
  assert.match(turn.reply.content, /budget shows \$/);
  assert.deepEqual(turn.reply.citations.map((c) => c.label), ["Budgets"]);

  const brief = fake.requests[0]!.system;
  for (const section of ["netWorth", "income", "budgets", "goals", "upcomingBills"]) {
    assert.match(brief, new RegExp(`"${section}"`), `the brief includes ${section}`);
  }
  assert.ok((fake.requests[0]!.tools?.length ?? 0) >= 10, "the model gets the whole tool set");

  const reloaded = await client.getAdvisorConversation({ params: { id: conversation.id } });
  assert.deepEqual(reloaded.messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(reloaded.title, "How are my budgets?");
  assert.equal((await client.listAdvisorConversations())[0]?.id, conversation.id);

  await client.deleteAdvisorConversation({ params: { id: conversation.id } });
  assert.equal((await client.listAdvisorConversations()).length, 0);
});

test("an Advisor answer with an invented figure falls back to a safe answer from code", async () => {
  const { client, deps } = setup();
  deps.llm = toolCallingLlm([{ name: "get_budgets" }], () => "Cut $7,654,321 a month.").llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "Help" } });
  assert.equal(turn.reply.source, "fallback");
  assert.doesNotMatch(turn.reply.content, /7,654,321/);
});

test("with no model, the Advisor still answers from the user's data", async () => {
  const { client } = setup();
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "How am I doing?" } });
  assert.equal(turn.reply.source, "fallback");
  assert.match(turn.reply.content, /Net worth: -?\$/);
  const legacy = await client.advisorChat({ body: { messages: [{ role: "user", content: "Hi" }] } });
  assert.equal(legacy.source, "fallback");
});

test("the Advisor can see Copilot scans and reports", async () => {
  const { client, deps } = setup();
  const scan = await client.evaluateCopilot({ body: rental });
  assert.equal(scan.status, "ok");
  deps.llm = toolCallingLlm([{ name: "list_copilot_scans" }, { name: "get_quarterly_report" }], (results) => {
    const [scans] = results as Array<{ response: { result: { scans: Array<{ merchant: string; price: string }> } } }>;
    const first = scans!.response.result.scans[0]!;
    return `The Copilot checked ${first.merchant} at ${first.price}.`;
  }).llm;
  const conversation = await client.createAdvisorConversation({
    body: { situation: scan.status === "ok" ? { kind: "copilot_event", eventId: scan.eventId } : null },
  });
  assert.equal(conversation.title, "About a Copilot scan");
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "What did it find?" } });
  assert.equal(turn.reply.source, "gemini");
  assert.match(turn.reply.content, /Demo Rentals at \$1,950/);
});

test("a drafted life event is attached but never saved", async () => {
  const { client, deps } = setup();
  const before = (await client.listLifeEvents()).length;
  deps.llm = toolCallingLlm(
    [{ name: "draft_life_event", args: { type: "child", date: "2027-03-01", recurrence: "recurring", amount: 1200 } }],
    () => "Here is a draft. Review it and press Confirm if it looks right.",
  ).llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({
    params: { id: conversation.id },
    body: { content: "We're having a baby in March, about $1,200 a month" },
  });
  const [attachment] = turn.reply.attachments;
  assert.equal(attachment?.kind, "life_event_draft");
  assert.equal(attachment?.kind === "life_event_draft" && attachment.draft.dollarImpactCents, -120_000);
  assert.equal((await client.listLifeEvents()).length, before, "drafting must not save");
});

test("a life event draft needs an amount the user actually stated", async () => {
  const { client, deps } = setup();
  deps.llm = toolCallingLlm(
    [{ name: "draft_life_event", args: { type: "child", date: "2027-03-01", recurrence: "recurring", amount: 1500 } }],
    () => "How much do you expect it to cost each month?",
  ).llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "We're having a baby in March" } });
  assert.equal(turn.reply.attachments.length, 0);
});

type ToolResults = Array<{ name: string; response: { result?: Record<string, unknown>; error?: string } }>;

test("plan_goal works out the monthly amount in code, with its working attached", async () => {
  const { client, deps } = setup();
  deps.llm = toolCallingLlm([{ name: "plan_goal", args: { goal: "japan" } }], (results) => {
    const plan = (results as ToolResults)[0]!.response.result!;
    return `Save ${plan.monthlyNeeded} a month to reach ${plan.target} by ${plan.targetDate}.`;
  }).llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "How do I hit my Japan trip?" } });
  assert.equal(turn.reply.source, "gemini", turn.reply.content);
  const [working] = turn.reply.attachments;
  assert.equal(working?.kind, "calculation");
  assert.match(working?.kind === "calculation" ? working.expression : "", /\$5,000 target - \$1,850 saved/);
});

test("find_savings sizes cuts from flexible spending and simulates them", async () => {
  const { client, deps } = setup();
  let seen: Record<string, unknown> = {};
  deps.llm = toolCallingLlm([{ name: "find_savings", args: { goal: "japan" } }], (results) => {
    seen = (results as ToolResults)[0]!.response.result!;
    return "Here are some places you could trim.";
  }).llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "Where can I cut back?" } });
  assert.ok(Array.isArray(seen.suggestedCuts), JSON.stringify(seen));
  assert.ok(Array.isArray(seen.flexibleCategories));
});

test("the calculator only takes figures the Advisor was given", async () => {
  const { client, deps } = setup();
  let results: ToolResults = [];
  deps.llm = toolCallingLlm(
    [
      { name: "calculate", args: { expression: "(5000 - 1850) / 6", label: "Monthly for Japan" } },
      { name: "calculate", args: { expression: "777 * 3", label: "Made up" } },
    ],
    (r) => { results = r as ToolResults; return "Done."; },
  ).llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "Work it out" } });
  assert.equal(results[0]!.response.result!.result, "525");
  assert.match(results[1]!.response.error ?? "", /777/);
  assert.deepEqual(turn.reply.attachments.map((a) => a.kind), ["calculation"]);
});

test("web search sends only a generic query and refuses personal ones", async () => {
  const { client, deps } = setup();
  const queries: string[] = [];
  let results: ToolResults = [];
  const fake = toolCallingLlm(
    [
      { name: "web_search", args: { query: "Chase Freedom Unlimited APR and annual fee" } },
      { name: "web_search", args: { query: `should ${"Alex Rivera"} get a card with $12,000 saved` } },
    ],
    (r) => { results = r as ToolResults; return "It has no annual fee, per the issuer."; },
  ).llm;
  deps.llm = {
    ...fake,
    webSearch: async ({ query }: { query: string }) => {
      queries.push(query);
      return { answer: "No annual fee. 20.49%-29.24% variable APR.", sources: [{ title: "chase.com", url: "https://chase.com" }] };
    },
  };
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "Should I get the Chase Freedom Unlimited?" } });
  assert.deepEqual(queries, ["Chase Freedom Unlimited APR and annual fee"], "the personal query never leaves");
  assert.match(results[1]!.response.error ?? "", /refused/);
  assert.equal(turn.reply.source, "gemini");
  assert.ok(turn.reply.attachments.some((a) => a.kind === "web_sources"));
});

async function askWithTools(
  calls: Array<{ name: string; args?: Record<string, unknown> }>,
  question: string,
  answer: (results: ToolResults) => string = () => "Here is what I found.",
) {
  const { client, deps } = setup();
  let results: ToolResults = [];
  deps.llm = toolCallingLlm(calls, (r) => { results = r as ToolResults; return answer(results); }).llm;
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: question } });
  return { turn, results, client };
}

test("car financing at the user's own rate, price, and down payment", async () => {
  const { turn, results } = await askWithTools(
    [{ name: "simulate_scenario", args: { changes: [{ kind: "loan", label: "Car loan", price: 28000, downPayment: 3000, aprPercent: 13 }] } }],
    "Can I afford a car financing with 13% interest and 28,000 total car price and 3000 down payment?",
    (r) => {
      const loan = (r[0]!.response.result!.loans as Array<{ monthlyPayment: string }>)[0]!;
      return `The payment would be ${loan.monthlyPayment} a month over 60 months.`;
    },
  );
  const data = results[0]!.response.result!;
  assert.equal((data.loans as Array<{ monthlyPayment: string }>)[0]!.monthlyPayment, "$568.83");
  assert.match(String((data.assumptions as string[])[0]), /60 months/, "the assumed term is stated");
  assert.ok((data.cash as Record<string, unknown>).debtToIncomeAfter);
  assert.equal(turn.reply.source, "gemini", turn.reply.content);
  assert.equal(turn.reply.attachments[0]?.kind, "calculation");
});

test("a scenario refuses amounts nobody gave", async () => {
  const { results } = await askWithTools(
    [{ name: "simulate_scenario", args: { changes: [{ kind: "one_time", label: "Trip", amount: 1234, date: "2027-03-15" }] } }],
    "I want to go on a spring trip to Arkansas",
  );
  assert.match(results[0]!.response.error ?? "", /1234/);
});

test("a spring trip: a new goal from a stated budget, its odds, and a draft to save", async () => {
  const { turn, results, client } = await askWithTools(
    [
      { name: "simulate_scenario", args: { changes: [{ kind: "new_goal", label: "Arkansas spring trip", amount: 1200, date: "2027-03-15" }] } },
      { name: "draft_goal", args: { name: "Arkansas spring trip", target: 1200, date: "2027-03-15" } },
    ],
    "If I wanna go on a spring trip to Arkansas with about $1,200 in the next few months, what do I need to do?",
    (r) => {
      const goal = (r[0]!.response.result!.newGoals as Array<{ monthlyNeeded: string; by: string }>)[0]!;
      return `Save about ${goal.monthlyNeeded} a month to have it by March 15, 2027.`;
    },
  );
  const newGoal = (results[0]!.response.result!.newGoals as Array<{ likelihood: string }>)[0]!;
  assert.match(newGoal.likelihood, /%/);
  assert.equal(turn.reply.source, "gemini", turn.reply.content);
  const plans = turn.reply.attachments.filter((a) => a.kind === "visual" && a.visual.kind === "goal_plan");
  assert.equal(plans.length, 1, "one planner per answer, even when two tools make one");
  const plan = plans[0]!;
  assert.equal(plan.kind === "visual" && plan.visual.kind === "goal_plan" && plan.visual.inputs.targetCents, 120_000);
  const before = (await client.listGoals()).length;
  assert.equal(before, (await client.listGoals()).length, "drafting saves nothing");
  assert.ok(!(await client.listGoals()).some((g) => g.name === "Arkansas spring trip"));
});

type GrowthResult = { label: string; source: string; ratePercent: number; value: string };

test("IRA versus index fund with no rate given: fallback rates, labeled as assumed", async () => {
  const { turn, results } = await askWithTools(
    [{ name: "finance_calc", args: { formula: "growth", amount: 500, years: 10 } }],
    "Which is a better investment decision, investing $500 in an IRA or investing $500 in S&P 500?",
    (r) => {
      const g = r[0]!.response.result!.results as GrowthResult[];
      return `Over 10 years, $500 could grow to between ${g[0]!.value} and ${g[2]!.value} at assumed rates. An IRA can hold an S&P 500 fund.`;
    },
  );
  const data = results[0]!.response.result!;
  assert.equal(data.contributed, "$500");
  assert.ok((data.results as GrowthResult[]).every((r) => r.source === "assumed"));
  assert.match(String(data.note), /assumptions/);
  assert.equal(turn.reply.source, "gemini", turn.reply.content);
});

test("growth at the user's own rate, and a refused rate nobody gave", async () => {
  const { turn, results } = await askWithTools(
    [
      { name: "finance_calc", args: { formula: "growth", amount: 500, years: 10, rates: [{ label: "Your 9%", percent: 9, source: "user" }] } },
      { name: "finance_calc", args: { formula: "growth", amount: 500, years: 10, rates: [{ label: "Made up", percent: 23.5, source: "user" }] } },
    ],
    "If I get 9% a year, what does $500 become in 10 years?",
  );
  const [mine] = results[0]!.response.result!.results as GrowthResult[];
  assert.equal(mine!.ratePercent, 9);
  assert.match(results[1]!.response.error ?? "", /23.5/);
  const visual = turn.reply.attachments.find((a) => a.kind === "visual");
  assert.ok(visual?.kind === "visual" && visual.visual.kind === "growth_compare");
  assert.deepEqual(visual.visual.inputs.rates, [{ label: "Your 9%", annualReturnPercent: 9, source: "user" }]);
});

test("Nasdaq versus S&P 500 with searched historical returns and their sources", async () => {
  const { client, deps } = setup();
  let round = 0;
  deps.llm = {
    provider: "test",
    generate: async () => { throw new Error("unused"); },
    webSearch: async () => ({
      answer: "Over the last 30 years the S&P 500 returned about 10.5% a year and the Nasdaq-100 about 13.4% a year, with dividends reinvested.",
      sources: [{ title: "example.com", url: "https://example.com/returns" }],
    }),
    chat: async () => {
      round++;
      if (round === 1) return { message: { role: "model", text: null, functionCalls: [{ name: "web_search", args: { query: "S&P 500 vs Nasdaq-100 average annual return 30 years" } }] } };
      if (round === 2) {
        return {
          message: {
            role: "model",
            text: null,
            functionCalls: [{
              name: "finance_calc",
              args: { formula: "growth", amount: 500, years: 10, rates: [{ label: "S&P 500", percent: 10.5, source: "web" }, { label: "Nasdaq-100", percent: 13.4, source: "web" }] },
            }],
          },
        };
      }
      return { message: { role: "model", text: "Historically the Nasdaq-100 grew faster, with bigger swings. Past returns don't predict future ones.", functionCalls: [] } };
    },
  };
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "Should I invest $500 in the Nasdaq or the S&P 500 for 10 years?" } });
  assert.equal(turn.reply.source, "gemini", turn.reply.content);
  const visual = turn.reply.attachments.find((a) => a.kind === "visual");
  assert.ok(visual?.kind === "visual" && visual.visual.kind === "growth_compare");
  assert.deepEqual(visual.visual.inputs.rates.map((r) => [r.label, r.source]), [["S&P 500", "web"], ["Nasdaq-100", "web"]]);
  assert.deepEqual(visual.visual.inputs.sources, [{ title: "example.com", url: "https://example.com/returns" }]);
  const [sp, nasdaq] = visual.visual.series.at(-1)!.valuesCents as [number, number];
  assert.ok(nasdaq > sp);
});

test("finance_calc payoff, save_for, and time_to", async () => {
  const { results } = await askWithTools(
    [
      { name: "finance_calc", args: { formula: "save_for", amount: 1200, months: 4 } },
      { name: "finance_calc", args: { formula: "time_to", amount: 1200, monthly: 300 } },
      { name: "finance_calc", args: { formula: "payoff", amount: 1200, aprPercent: 13, monthly: 300 } },
    ],
    "I need $1,200 and can put away $300 a month; my card is 13%",
  );
  assert.equal(results[0]!.response.result!.monthlyNeeded, "$300");
  assert.equal(results[1]!.response.result!.months, 4);
  assert.equal(results[2]!.response.result!.paysOff, true);
});

test("a car loan answer carries an interactive loan explorer", async () => {
  const { turn } = await askWithTools(
    [{ name: "simulate_scenario", args: { changes: [{ kind: "loan", label: "Car loan", price: 28000, downPayment: 3000, aprPercent: 13 }] } }],
    "Can I afford a $28,000 car at 13% with $3,000 down?",
  );
  const attachment = turn.reply.attachments.find((a) => a.kind === "visual");
  assert.ok(attachment?.kind === "visual" && attachment.visual.kind === "loan_explorer");
  const v = attachment.visual;
  assert.equal(v.monthlyPaymentCents, 56_883);
  assert.deepEqual(v.terms.map((t) => t.termMonths), [36, 48, 60, 72]);
  assert.ok(v.typical.interestDifferenceCents > 0, "13% costs more than the typical 7%");
  assert.equal(v.amortization.at(-1)?.balanceCents, 0);
  assert.equal(v.interestToDate.at(-1)?.cents, v.amortization.reduce((s, y) => s + y.interestCents, 0));
  assert.ok(v.interestToDate.at(-1)!.cents > v.typical.interestToDate.at(-1)!.cents);
  assert.ok(v.interestShare > 0 && v.interestShare < 1);
});

test("visuals recompute through the API when the user moves a slider", async () => {
  const { client } = setup();
  const loan = await client.renderAdvisorVisual({
    body: { kind: "loan_explorer", inputs: { label: "Car", priceCents: 2_800_000, downPaymentCents: 800_000, aprPercent: 13, termMonths: 48 } },
  });
  assert.ok(loan.kind === "loan_explorer" && loan.financedCents === 2_000_000);

  const growth = await client.renderAdvisorVisual({
    body: { kind: "growth_compare", inputs: { initialCents: 50_000, monthlyCents: 0, years: 20, rates: [{ label: "Mine", annualReturnPercent: 9, source: "user" }] } },
  });
  assert.ok(growth.kind === "growth_compare" && growth.series.length === 21);
  assert.equal(growth.series[0]!.valuesCents.length, 1);

  const plan = await client.renderAdvisorVisual({
    body: { kind: "goal_plan", inputs: { name: "Trip", targetCents: 120_000, savedCents: 0, targetDate: "2027-03-15", selectedCuts: [] } },
  });
  assert.ok(plan.kind === "goal_plan");
  assert.equal(plan.coverage.coveredCents, 0, "no cuts chosen covers nothing");
  assert.ok(plan.fan.length > 1, "the new goal's simulated fan");
  assert.ok(plan.probabilityLow !== null);

  const card = await client.renderAdvisorVisual({
    body: { kind: "card_evaluator", inputs: { cardName: "Test Card", rewardsPercent: 1.5, annualFeeCents: 0, aprPercent: 29.24, monthlySpendCents: 100_000, paysInFull: true } },
  });
  assert.ok(card.kind === "card_evaluator" && card.figures.annualRewardsCents === 18_000);
  assert.ok(card.checks.length >= 3);
  assert.equal(card.creditScore?.mocked, true);
});

test("evaluate_card uses searched terms and links the search's sources", async () => {
  const { client, deps } = setup();
  const fake = toolCallingLlm(
    [{ name: "web_search", args: { query: "Chase Freedom Unlimited terms" } }],
    () => "unused",
  ).llm;
  let round = 0;
  deps.llm = {
    ...fake,
    webSearch: async () => ({ answer: "1.5% cash back, $0 annual fee, 20.49%-29.24% variable APR.", sources: [{ title: "chase.com", url: "https://chase.com" }] }),
    chat: async (request) => {
      round++;
      if (round === 1) return { message: { role: "model", text: null, functionCalls: [{ name: "web_search", args: { query: "Chase Freedom Unlimited terms" } }] } };
      if (round === 2) return { message: { role: "model", text: null, functionCalls: [{ name: "evaluate_card", args: { cardName: "Chase Freedom Unlimited", rewardsPercent: 1.5, annualFee: 0, aprPercent: 29.24 } }] } };
      void request;
      return { message: { role: "model", text: "It has no annual fee and earns 1.5% back. See the card below.", functionCalls: [] } };
    },
  };
  const conversation = await client.createAdvisorConversation({ body: {} });
  const turn = await client.sendAdvisorMessage({ params: { id: conversation.id }, body: { content: "Should I take the Chase Freedom Unlimited?" } });
  assert.equal(turn.reply.source, "gemini", turn.reply.content);
  const card = turn.reply.attachments.find((a) => a.kind === "visual");
  assert.ok(card?.kind === "visual" && card.visual.kind === "card_evaluator");
  assert.deepEqual(card.visual.inputs.sources, [{ title: "chase.com", url: "https://chase.com" }]);
});

test("a financed car goes through the scenario with the user's own terms, not the Copilot's", async () => {
  const { turn, results } = await askWithTools(
    [
      { name: "check_purchase", args: { price: 10000, kind: "vehicle" } },
      { name: "simulate_scenario", args: { changes: [{ kind: "loan", label: "Honda Accord", price: 10000, downPayment: 3000, aprPercent: 7.49 }] } },
    ],
    "Can I afford a $10,000 Honda Accord at 7.49% APR with $3,000 down?",
  );
  assert.match(results[0]!.response.error ?? "", /Bad arguments/, "check_purchase no longer takes financed cars");
  const loan = (results[1]!.response.result!.loans as Array<{ financed: string }>)[0]!;
  assert.equal(loan.financed, "$7,000");
  const visual = turn.reply.attachments.find((a) => a.kind === "visual");
  assert.ok(visual?.kind === "visual" && visual.visual.kind === "loan_explorer" && visual.visual.inputs.aprPercent === 7.49);
});

test("deleting a life event removes it and saves a fresh run without it", async () => {
  const { client } = setup();
  const before = await client.runSimulation({ body: { persist: false } });
  const { event } = await client.createLifeEvent({
    body: { type: "job_change", date: "2026-11-09", recurrence: "one_time", dollarImpactCents: -3_000_000, durationMonths: null, linkedGoalId: null, source: "form" },
  });
  const { deleted, run } = await client.deleteLifeEvent({ params: { id: event.id } });
  assert.equal(deleted, true);
  assert.ok(!(await client.listLifeEvents()).some((e) => e.id === event.id));
  assert.deepEqual(run.goalOutcomes.map((o) => o.probabilityLow), before.goalOutcomes.map((o) => o.probabilityLow), "odds are back to before the event");
  const [latest] = await client.listSimulations();
  assert.equal(latest?.id, run.id, "the fresh run is the latest saved one");
  await assert.rejects(client.deleteLifeEvent({ params: { id: event.id } }), /No such life event/);
});
