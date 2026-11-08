/**
 * The one wrapper every model call goes through. Swapping a model or provider is a change
 * to this file only. Nothing else in the repo may import a provider SDK.
 */
export type ModelTier = "flash" | "pro";

export interface LlmRequest {
  tier: ModelTier;
  system: string;
  prompt: string;
  /** Set for structured output. The provider must return JSON matching this schema. */
  jsonSchema?: Record<string, unknown>;
  /** Give up after this long, so callers can fall back in time. Defaults per provider. */
  timeoutMs?: number;
}

export interface LlmClient {
  readonly provider: string;
  generate(request: LlmRequest): Promise<string>;
}

class MockLlmClient implements LlmClient {
  readonly provider = "mock";

  async generate(): Promise<string> {
    throw new Error("Mock LLM: callers fall back to their deterministic path.");
  }
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Gemini's REST schema format uses upper-case type names ("OBJECT", "STRING"). Callers write
 * ordinary JSON Schema, so convert the `type` fields on the way out.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>).map(([key, value]) => [
      key,
      key === "type" && typeof value === "string" ? value.toUpperCase() : toGeminiSchema(value),
    ]),
  );
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class GeminiClient implements LlmClient {
  readonly provider = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly models: Record<ModelTier, string>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(request: LlmRequest): Promise<string> {
    const model = this.models[request.tier];
    if (!this.apiKey) throw new Error("Gemini: GEMINI_API_KEY is not set.");
    if (!model) throw new Error(`Gemini: no model name set for the ${request.tier} tier.`);

    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: request.jsonSchema
        ? { responseMimeType: "application/json", responseSchema: toGeminiSchema(request.jsonSchema) }
        : {},
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? GEMINI_DEFAULT_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        // The key goes in a header, never the URL, so it stays out of logs.
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (!res.ok) {
        throw new Error(`Gemini: HTTP ${res.status}${data.error?.message ? `: ${data.error.message}` : ""}`);
      }
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini: prompt blocked (${data.promptFeedback.blockReason}).`);
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error(`Gemini: empty response (${data.candidates?.[0]?.finishReason ?? "no candidates"}).`);
      return text;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Gemini: timed out.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (env.LLM_PROVIDER !== "gemini") return new MockLlmClient();
  return new GeminiClient(env.GEMINI_API_KEY ?? "", {
    flash: env.GEMINI_MODEL_FLASH ?? "",
    pro: env.GEMINI_MODEL_PRO ?? "",
  });
}
