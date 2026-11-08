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
