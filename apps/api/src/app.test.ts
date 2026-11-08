import assert from "node:assert/strict";
import { test } from "node:test";
import { createApiClient, type CopilotContext } from "@finvantage/contracts";
import { createApp } from "./app";
import { createDeps } from "./deps";

/** A real client against the real app, in process. Every call validates against the contracts. */
function setup() {
  const app = createApp(createDeps({}), {});
  const client = createApiClient({
    baseUrl: "http://test",
    token: "demo-token",
    fetch: ((url: string, init: RequestInit) => app.request(url, init)) as typeof fetch,
  });
  return { app, client };
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

test("an unmatched life event sentence returns the supported types", async () => {
  const { client } = setup();
  const result = await client.parseLifeEvent({ body: { text: "we adopted a llama" } });
  assert.equal(result.matched, false);
  assert.equal((await client.listLifeEvents()).length, 0);
});
