import assert from "node:assert/strict";
import test from "node:test";
import type { LlmClient } from "./client";
import { parseLifeEvent } from "./life-event-parser";

function llmWith(response: string): LlmClient {
  return { provider: "test", async generate() { return response; } };
}

const mock: LlmClient = { provider: "mock", async generate() { throw new Error("offline"); } };

test("creates a dated baby event draft without guessing its financial impact", async () => {
  const result = await parseLifeEvent(mock, "We're having a baby in March", "2026-11-07");
  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.draft.type, "child");
    assert.equal(result.draft.date, "2027-03-01");
    assert.equal(result.draft.dollarImpactCents, 0);
    assert.equal(result.draft.source, "parsed");
  }
});

test("reads an explicit recurring cost and duration from text", async () => {
  const result = await parseLifeEvent(mock, "We may move on 2027-04-15 and rent will increase by $400 a month for 2 years", "2026-11-07");
  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.draft.type, "move");
    assert.equal(result.draft.date, "2027-04-15");
    assert.equal(result.draft.dollarImpactCents, -40_000);
    assert.equal(result.draft.recurrence, "recurring");
    assert.equal(result.draft.durationMonths, 24);
  }
});

test("reads an explicit income increase as positive", async () => {
  const result = await parseLifeEvent(mock, "I change jobs in February and get a $500 monthly salary increase", "2026-11-07");
  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.draft.type, "job_change");
    assert.equal(result.draft.date, "2027-02-01");
    assert.equal(result.draft.dollarImpactCents, 50_000);
  }
});

test("uses Gemini only to classify and never accepts invented financial details", async () => {
  const result = await parseLifeEvent(llmWith('{"type":"move","dollarImpactCents":-90000,"date":"2027-02-01"}'), "We may relocate in June", "2026-11-07");
  assert.equal(result.matched, true);
  if (result.matched) {
    assert.equal(result.draft.date, "2027-06-01");
    assert.equal(result.draft.dollarImpactCents, 0);
  }
});

test("returns no match for unsupported events or missing dates", async () => {
  assert.equal((await parseLifeEvent(mock, "we adopted a llama", "2026-11-07")).matched, false);
  assert.equal((await parseLifeEvent(mock, "we may move next year", "2026-11-07")).matched, true);
  assert.equal((await parseLifeEvent(mock, "we may move soon", "2026-11-07")).matched, false);
});
