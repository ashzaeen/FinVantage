import assert from "node:assert/strict";
import { test } from "node:test";
import { ADVISOR_VOICE_STYLE, runAdvisorTurn } from "./advisory";
import { GeminiClient, pcm16ToWav, type LlmChatRequest, type LlmClient } from "./client";

test("pcm16ToWav writes a valid mono 16-bit header around the audio", () => {
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);
  const wav = Buffer.from(pcm16ToWav(pcm.toString("base64"), 24_000), "base64");
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.deepEqual([...wav.subarray(44)], [...pcm]);
});

function ttsFetch(body: unknown, calls: Array<{ url: string; body: any }>, status = 200): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("speak asks the TTS model for audio and returns it as WAV", async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const pcm = Buffer.from([5, 0, 6, 0]).toString("base64");
  const client = new GeminiClient(
    "k",
    { flash: "flash-model" },
    ttsFetch({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }] }, calls),
    { model: "tts-model", voice: "Kore" },
  );
  const audio = await client.speak({ text: "You can afford it." });
  assert.equal(audio.mimeType, "audio/wav");
  assert.equal(Buffer.from(audio.audioBase64, "base64").subarray(0, 4).toString(), "RIFF");
  assert.match(calls[0]!.url, /tts-model:generateContent$/);
  assert.deepEqual(calls[0]!.body.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(calls[0]!.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.equal(calls[0]!.body.contents[0].parts[0].text, "You can afford it.");
});

test("speak throws without a TTS model, so the caller falls back to the browser voice", async () => {
  const client = new GeminiClient("k", { flash: "f" }, ttsFetch({}, []));
  await assert.rejects(client.speak({ text: "hi" }), /GEMINI_MODEL_TTS/);
});

test("speak throws when the reply holds no audio", async () => {
  const client = new GeminiClient("k", { flash: "f" }, ttsFetch({ candidates: [{ finishReason: "OTHER", content: { parts: [{ text: "no" }] } }] }, []), { model: "m", voice: "Kore" });
  await assert.rejects(client.speak({ text: "hi" }), /no audio/);
});

test("a voice turn adds the spoken style to the system prompt, and a text turn does not", async () => {
  const systems: string[] = [];
  const llm: LlmClient = {
    provider: "test",
    generate: async () => { throw new Error("unused"); },
    chat: async (request: LlmChatRequest) => {
      systems.push(request.system);
      return { message: { role: "model", text: "You are on track.", functionCalls: [] } };
    },
  };
  const input = { brief: {}, briefLines: [], history: [{ role: "user" as const, content: "How am I doing?" }], tools: [] };
  await runAdvisorTurn(llm, { ...input, voice: true });
  await runAdvisorTurn(llm, input);
  assert.ok(systems[0]!.includes(ADVISOR_VOICE_STYLE));
  assert.ok(!systems[1]!.includes("VOICE REPLY"));
});
