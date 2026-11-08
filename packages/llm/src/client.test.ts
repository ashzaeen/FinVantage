import assert from "node:assert/strict";
import { test } from "node:test";
import { createLlmClient, GeminiClient, toGeminiSchema } from "./client";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[] = [], delayMs = 0): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayMs);
        init.signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("aborted")); });
      });
    }
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const ok = { candidates: [{ content: { parts: [{ text: '{"impact":"a","tradeOff":"b","smartMove":"c"}' }] } }] };
const models = { flash: "flash-model" };

test("mock is the default, and it always throws so fallbacks run", async () => {
  const client = createLlmClient({});
  assert.equal(client.provider, "mock");
  await assert.rejects(client.generate({ tier: "flash", system: "s", prompt: "p" }));
});

test("LLM_PROVIDER=gemini creates the Gemini client", () => {
  assert.equal(createLlmClient({ LLM_PROVIDER: "gemini" }).provider, "gemini");
});

test("sends the right model, key header, and JSON mode; returns the text", async () => {
  const calls: Call[] = [];
  const client = new GeminiClient("test-key", models, fakeFetch(200, ok, calls));
  const text = await client.generate({ tier: "flash", system: "sys", prompt: "hi", jsonSchema: { type: "object", properties: { a: { type: "string" } } } });
  assert.equal(text, '{"impact":"a","tradeOff":"b","smartMove":"c"}');
  const { url, init } = calls[0]!;
  assert.match(url, /\/models\/flash-model:generateContent$/);
  assert.doesNotMatch(url, /test-key/, "the key must not be in the URL");
  assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  const body = JSON.parse(String(init.body));
  assert.equal(body.systemInstruction.parts[0].text, "sys");
  assert.equal(body.contents[0].parts[0].text, "hi");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.responseSchema.type, "OBJECT");
  assert.equal(body.generationConfig.responseSchema.properties.a.type, "STRING");
});

test("thinking level is sent only when asked for", async () => {
  const calls: Call[] = [];
  const client = new GeminiClient("k", models, fakeFetch(200, ok, calls));
  await client.generate({ tier: "flash", system: "s", prompt: "p", thinking: "minimal" });
  await client.generate({ tier: "flash", system: "s", prompt: "p" });
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)).generationConfig.thinkingConfig, { thinkingLevel: "minimal" });
  assert.equal(JSON.parse(String(calls[1]!.init.body)).generationConfig.thinkingConfig, undefined);
});

test("flash tier uses the flash model", async () => {
  const calls: Call[] = [];
  await new GeminiClient("k", models, fakeFetch(200, ok, calls)).generate({ tier: "flash", system: "s", prompt: "p" });
  assert.match(calls[0]!.url, /flash-model/);
});

test("errors throw, so callers fall back", async () => {
  await assert.rejects(new GeminiClient("k", models, fakeFetch(429, { error: { message: "quota" } })).generate({ tier: "flash", system: "s", prompt: "p" }), /429: quota/);
  await assert.rejects(new GeminiClient("k", models, fakeFetch(200, { promptFeedback: { blockReason: "SAFETY" } })).generate({ tier: "flash", system: "s", prompt: "p" }), /blocked/);
  await assert.rejects(new GeminiClient("k", models, fakeFetch(200, { candidates: [] })).generate({ tier: "flash", system: "s", prompt: "p" }), /empty/);
  await assert.rejects(new GeminiClient("", models, fakeFetch(200, ok)).generate({ tier: "flash", system: "s", prompt: "p" }), /GEMINI_API_KEY/);
  await assert.rejects(new GeminiClient("k", { flash: "" }, fakeFetch(200, ok)).generate({ tier: "flash", system: "s", prompt: "p" }), /model name/);
});

test("a slow response times out", async () => {
  const client = new GeminiClient("k", models, fakeFetch(200, ok, [], 500));
  await assert.rejects(client.generate({ tier: "flash", system: "s", prompt: "p", timeoutMs: 50 }), /timed out/);
});

test("schema conversion upper-cases types everywhere and leaves other fields alone", () => {
  assert.deepEqual(toGeminiSchema({ type: "array", items: { type: "object", required: ["type"] } }), {
    type: "ARRAY",
    items: { type: "OBJECT", required: ["type"] },
  });
});

test("schema conversion drops keywords Gemini rejects, but keeps fields that share their names", () => {
  // Gemini answers HTTP 400 "Unknown name additionalProperties" for these, which sent every
  // quarterly report to the template.
  assert.deepEqual(
    toGeminiSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        additionalProperties: { type: "string" },
        list: { type: "array", items: { type: "object", properties: {}, additionalProperties: false } },
      },
      required: ["list"],
      additionalProperties: false,
    }),
    {
      type: "OBJECT",
      properties: {
        additionalProperties: { type: "STRING" },
        list: { type: "ARRAY", items: { type: "OBJECT", properties: {} } },
      },
      required: ["list"],
    },
  );
});

test("chat sends history, tools, and function responses; returns calls and raw parts", async () => {
  const calls: Call[] = [];
  const reply = {
    candidates: [{
      content: {
        parts: [
          { text: "thinking", thought: true },
          { functionCall: { name: "get_budgets", args: { month: "2026-11" } }, thoughtSignature: "sig" },
        ],
      },
    }],
  };
  const client = new GeminiClient("k", models, fakeFetch(200, reply, calls));
  const tools = [{ name: "get_budgets", description: "Budgets", parameters: { type: "object", additionalProperties: false, properties: { month: { type: "string" } } } }];
  const { message } = await client.chat({
    tier: "flash",
    system: "sys",
    tools,
    messages: [
      { role: "user", text: "hi" },
      { role: "model", text: null, functionCalls: [{ name: "get_goals", args: {} }], raw: [{ functionCall: { name: "get_goals", args: {} }, thoughtSignature: "old" }] },
      { role: "tool", results: [{ name: "get_goals", response: { goals: [] } }] },
    ],
  });
  assert.equal(message.text, null, "thought parts are not answer text");
  assert.deepEqual(message.functionCalls, [{ name: "get_budgets", args: { month: "2026-11" } }]);
  assert.equal((message.raw as Array<{ thoughtSignature?: string }>)[1]!.thoughtSignature, "sig");

  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.tools[0].functionDeclarations[0].parameters.type, "OBJECT");
  assert.equal(body.tools[0].functionDeclarations[0].parameters.additionalProperties, undefined);
  assert.equal(body.contents[1].parts[0].thoughtSignature, "old", "model turns replay their raw parts");
  assert.deepEqual(body.contents[2].parts[0], { functionResponse: { name: "get_goals", response: { goals: [] } } });
});

test("chat returns text when the model answers, and throws on an empty reply", async () => {
  const client = new GeminiClient("k", models, fakeFetch(200, { candidates: [{ content: { parts: [{ text: "Hello" }] } }] }));
  const { message } = await client.chat({ tier: "flash", system: "s", messages: [{ role: "user", text: "hi" }] });
  assert.equal(message.text, "Hello");
  assert.deepEqual(message.functionCalls, []);
  await assert.rejects(new GeminiClient("k", models, fakeFetch(200, { candidates: [] })).chat({ tier: "flash", system: "s", messages: [{ role: "user", text: "hi" }] }), /empty/);
  await assert.rejects(createLlmClient({}).chat!({ tier: "flash", system: "s", messages: [] }));
});

test("schema conversion turns exclusive bounds inclusive and drops formats Gemini lacks", () => {
  assert.deepEqual(
    toGeminiSchema({ type: "object", properties: { n: { type: "number", exclusiveMinimum: 0 }, d: { type: "string", format: "date" }, t: { type: "string", format: "date-time" } } }),
    { type: "OBJECT", properties: { n: { type: "NUMBER", minimum: 0 }, d: { type: "STRING" }, t: { type: "STRING", format: "date-time" } } },
  );
});

test("web search sends only the query with Google Search grounding, and returns sources", async () => {
  const calls: Call[] = [];
  const reply = {
    candidates: [{
      content: { parts: [{ text: "No annual fee; 1.5% cash back on most purchases." }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: "https://a.example", title: "a.example" } }, { web: { uri: "https://a.example", title: "dup" } }] },
    }],
  };
  const result = await new GeminiClient("k", models, fakeFetch(200, reply, calls)).webSearch({ query: "Chase Freedom Unlimited terms" });
  assert.match(result.answer, /annual fee/);
  assert.deepEqual(result.sources, [{ title: "a.example", url: "https://a.example" }]);
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(body.contents.length, 1);
  assert.equal(body.contents[0].parts[0].text, "Chase Freedom Unlimited terms");
  await assert.rejects(createLlmClient({}).webSearch!({ query: "x" }));
});
