import assert from "node:assert/strict";
import { test } from "node:test";
import type { LlmClient, LlmRequest } from "./client";
import {
  MAX_DRAFT_WORDS,
  draftProblem,
  formatLongDate,
  generateSubscriptionDraft,
  templateDraft,
  type SubscriptionDraftInput,
} from "./subscription-draft";
import { wordCount } from "./guardrails";

const base: SubscriptionDraftInput = {
  action: "cancel",
  merchant: "StreamFlix",
  amount: "$15.49",
  cadence: "a month",
  previousAmount: null,
  changedOn: null,
  cancelledOn: null,
  chargedOn: null,
  chargedAmount: null,
};
const lowerBill: SubscriptionDraftInput = { ...base, action: "lower_bill", previousAmount: "$11.99", changedOn: "October 3, 2026" };
const dispute: SubscriptionDraftInput = { ...base, action: "dispute", cancelledOn: "September 10, 2026", chargedOn: "November 3, 2026", chargedAmount: "$15.49" };

/** A model that answers with the given text, and remembers what it was asked. */
function model(reply: string | Error, provider = "fake") {
  const requests: LlmRequest[] = [];
  const client: LlmClient = {
    provider,
    async generate(request) {
      requests.push(request);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { client, requests };
}
const says = (text: string) => JSON.stringify({ text });

test("a date is written out from the text, whatever the time zone", () => {
  assert.equal(formatLongDate("2026-10-03"), "October 3, 2026");
  assert.equal(formatLongDate("2027-01-01"), "January 1, 2027");
  assert.equal(formatLongDate("nonsense"), "nonsense");
});

test("each template uses the user's figures and passes the same checks as a model's message", () => {
  for (const input of [base, lowerBill, dispute]) {
    const text = templateDraft(input);
    assert.equal(draftProblem(text, input), null, input.action);
    assert.ok(wordCount(text) <= MAX_DRAFT_WORDS, input.action);
    assert.ok(text.includes("StreamFlix") && text.includes("$15.49"), input.action);
  }
  assert.ok(templateDraft(lowerBill).includes("$11.99") && templateDraft(lowerBill).includes("October 3, 2026"));
  assert.ok(templateDraft(dispute).includes("September 10, 2026") && templateDraft(dispute).includes("November 3, 2026"));
});

test("a template for a message with figures missing is refused rather than left with a gap", () => {
  assert.throws(() => templateDraft({ ...lowerBill, previousAmount: null }));
  assert.throws(() => templateDraft({ ...dispute, chargedOn: null }));
});

test("a model's message that uses only the given figures is used", async () => {
  const text = "Hello, I cancelled my StreamFlix subscription on September 10, 2026, but was charged $15.49 on November 3, 2026. Please refund it and confirm in writing. Thank you.";
  const { client } = model(says(text));
  assert.deepEqual(await generateSubscriptionDraft(client, dispute), { text, source: "model" });
});

test("a model's message with an invented figure falls back to the template", async () => {
  const { client } = model(says("Hello, please cancel StreamFlix. I pay $12.99 a month. Thank you."));
  const result = await generateSubscriptionDraft(client, base);
  assert.deepEqual(result, { text: templateDraft(base), source: "template" });
});

test("each way a message can go wrong falls back to the template", async () => {
  const wrong = [
    "Please cancel StreamFlix. I pay fifteen dollars a month.",
    "Please cancel StreamFlix, I pay $2k a year.",
    "Please cancel StreamFlix. Write to me at me@example.com.",
    "Please cancel StreamFlix. See https://example.com/me for my account.",
    "Please cancel StreamFlix, or my lawyer will be in touch.",
    "Please cancel StreamFlix. This price is unfair.",
    "Please cancel StreamFlix. Other competitors charge less.",
    "word ".repeat(MAX_DRAFT_WORDS + 1).trim(),
    "   ",
  ];
  for (const text of wrong) {
    const { client } = model(says(text));
    const result = await generateSubscriptionDraft(client, base);
    assert.equal(result.source, "template", text);
  }
});

test("a reply that is not the expected shape, or a failing model, falls back to the template", async () => {
  for (const reply of ["not json", JSON.stringify({ text: 42 }), JSON.stringify({}), new Error("timeout")]) {
    const { client } = model(reply);
    assert.equal((await generateSubscriptionDraft(client, base)).source, "template");
  }
});

test("the mock provider always gives the template, quietly", async () => {
  const warn = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args) => void warnings.push(args);
  try {
    const { client } = model(new Error("Mock LLM"), "mock");
    assert.equal((await generateSubscriptionDraft(client, base)).source, "template");
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

test("the model is asked for only what the message needs", async () => {
  const { client, requests } = model(says(templateDraft(lowerBill)));
  await generateSubscriptionDraft(client, lowerBill);
  const sent = JSON.parse(requests[0]!.prompt) as Record<string, unknown>;
  assert.deepEqual(Object.keys(sent).sort(), ["action", "company", "exampleMessage", "figures"]);
  assert.deepEqual(Object.keys(sent.figures as object).sort(), ["amount", "cadence", "changedOn", "chargedAmount", "chargedOn", "cancelledOn", "previousAmount"].sort());
  assert.equal(requests[0]!.tier, "flash");
  assert.ok(requests[0]!.system.includes("Never threaten"));
});

test("a message that names the company keeps the company's own digits", async () => {
  const input = { ...base, merchant: "Studio 54 Gym" };
  const text = "Hello, please cancel my Studio 54 Gym subscription. I pay $15.49 a month. Thank you.";
  const { client } = model(says(text));
  assert.deepEqual(await generateSubscriptionDraft(client, input), { text, source: "model" });
  // The company's digits approve nothing else.
  assert.equal(draftProblem("Please cancel Studio 54 Gym. I pay $54 a month.", input), "unknown figures: $54");
});
