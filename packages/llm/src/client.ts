/**
 * The one wrapper every model call goes through. Swapping a model or provider is a change
 * to this file only. Nothing else in the repo may import a provider SDK.
 */
export type ModelTier = "flash";

export interface LlmRequest {
  tier: ModelTier;
  system: string;
  prompt: string;
  /** Set for structured output. The provider must return JSON matching this schema. */
  jsonSchema?: Record<string, unknown>;
  /** Give up after this long, so callers can fall back in time. Defaults per provider. */
  timeoutMs?: number;
  /**
   * How much the model may reason before answering. Omit for the model's default. Gemini 3
   * models think by default, which can take over 15 seconds; "minimal" answers in about one.
   */
  thinking?: "minimal" | "low" | "high";
}

/** A function the model may call. `parameters` is ordinary JSON Schema for its arguments. */
export interface LlmToolDecl {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * One turn of a multi-turn conversation. A model turn keeps the provider's raw parts so it can
 * be replayed exactly: Gemini 3 attaches thought signatures that must come back unchanged.
 */
export type LlmMessage =
  | { role: "user"; text: string }
  | { role: "model"; text: string | null; functionCalls: LlmFunctionCall[]; raw?: unknown }
  | { role: "tool"; results: Array<{ name: string; response: Record<string, unknown> }> };

export interface LlmChatRequest {
  tier: ModelTier;
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDecl[];
  timeoutMs?: number;
  thinking?: "minimal" | "low" | "high";
}

export interface LlmChatResponse {
  /** The model's turn, ready to append to `messages` for the next call. */
  message: Extract<LlmMessage, { role: "model" }>;
}

export interface WebSearchRequest {
  query: string;
  timeoutMs?: number;
}

export interface WebSearchResult {
  /** A short summary written from the search results. */
  answer: string;
  sources: Array<{ title: string; url: string }>;
}

export interface LlmClient {
  readonly provider: string;
  generate(request: LlmRequest): Promise<string>;
  /** Multi-turn chat with function calling. Optional so simple fakes stay small; callers fall back without it. */
  chat?(request: LlmChatRequest): Promise<LlmChatResponse>;
  /** Searches the public web and summarizes what it finds, with sources. Only the query is sent. */
  webSearch?(request: WebSearchRequest): Promise<WebSearchResult>;
}

class MockLlmClient implements LlmClient {
  readonly provider = "mock";

  async generate(): Promise<string> {
    throw new Error("Mock LLM: callers fall back to their deterministic path.");
  }

  async chat(): Promise<LlmChatResponse> {
    throw new Error("Mock LLM: callers fall back to their deterministic path.");
  }

  async webSearch(): Promise<WebSearchResult> {
    throw new Error("Mock LLM: no web search.");
  }
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_DEFAULT_TIMEOUT_MS = 15_000;

/** JSON Schema keywords Gemini's response schema doesn't know. It rejects the request (HTTP 400). */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set(["additionalProperties", "$schema"]);
/** Gemini only knows these string formats; any other `format` is dropped (a pattern may still apply). */
const GEMINI_STRING_FORMATS = new Set(["enum", "date-time"]);
/** JSON Schema's exclusive bounds, as the inclusive bounds Gemini supports. */
const BOUND_KEYWORDS: Record<string, string> = { exclusiveMinimum: "minimum", exclusiveMaximum: "maximum" };

/**
 * Gemini's REST schema format uses upper-case type names ("OBJECT", "STRING") and a subset of
 * JSON Schema. Callers write ordinary JSON Schema, so convert the `type` fields and drop the
 * keywords Gemini rejects on the way out. Keys under `properties` are field names, not keywords,
 * so they are kept whatever they're called.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([key, value]) => !UNSUPPORTED_SCHEMA_KEYWORDS.has(key) && !(key === "format" && !GEMINI_STRING_FORMATS.has(String(value))))
      .map(([key, value]) => {
        if (key in BOUND_KEYWORDS && typeof value === "number") return [BOUND_KEYWORDS[key], value];
        if (key === "type" && typeof value === "string") return [key, value.toUpperCase()];
        if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
          return [key, Object.fromEntries(Object.entries(value).map(([field, sub]) => [field, toGeminiSchema(sub)]))];
        }
        return [key, toGeminiSchema(value)];
      }),
  );
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  [key: string]: unknown;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

function toGeminiContents(messages: LlmMessage[]) {
  return messages.map((m) => {
    if (m.role === "user") return { role: "user", parts: [{ text: m.text }] };
    if (m.role === "tool") {
      return {
        role: "user",
        parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: r.response } })),
      };
    }
    if (Array.isArray(m.raw)) return { role: "model", parts: m.raw };
    const parts: GeminiPart[] = [];
    if (m.text) parts.push({ text: m.text });
    for (const call of m.functionCalls) parts.push({ functionCall: { name: call.name, args: call.args } });
    return { role: "model", parts };
  });
}

export class GeminiClient implements LlmClient {
  readonly provider = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly models: Record<ModelTier, string>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(request: LlmRequest): Promise<string> {
    const data = await this.post(request.tier, {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: {
        ...(request.jsonSchema
          ? { responseMimeType: "application/json", responseSchema: toGeminiSchema(request.jsonSchema) }
          : {}),
        ...(request.thinking ? { thinkingConfig: { thinkingLevel: request.thinking } } : {}),
      },
    }, request.timeoutMs);
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) throw new Error(`Gemini: empty response (${data.candidates?.[0]?.finishReason ?? "no candidates"}).`);
    return text;
  }

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const data = await this.post(request.tier, {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: toGeminiContents(request.messages),
      ...(request.tools?.length
        ? {
            tools: [{
              functionDeclarations: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                parameters: toGeminiSchema(t.parameters),
              })),
            }],
          }
        : {}),
      generationConfig: request.thinking ? { thinkingConfig: { thinkingLevel: request.thinking } } : {},
    }, request.timeoutMs);
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
    const functionCalls = parts
      .filter((p) => p.functionCall?.name)
      .map((p) => ({ name: p.functionCall!.name!, args: p.functionCall!.args ?? {} }));
    if (!text && functionCalls.length === 0) {
      throw new Error(`Gemini: empty response (${data.candidates?.[0]?.finishReason ?? "no candidates"}).`);
    }
    return { message: { role: "model", text: text || null, functionCalls, raw: parts } };
  }

  /**
   * Google Search grounding, in a call of its own: the search tool and our function tools are
   * not combined in one request.
   */
  async webSearch(request: WebSearchRequest): Promise<WebSearchResult> {
    const data = await this.post("flash", {
      systemInstruction: {
        parts: [{
          text: "Answer the query factually from current web search results, in under 150 words. Give the published terms, fees, rates, and requirements exactly as the sources state them, and say when they may have changed. No personal advice.",
        }],
      },
      contents: [{ role: "user", parts: [{ text: request.query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    }, request.timeoutMs);
    const candidate = data.candidates?.[0];
    const answer = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
    if (!answer) throw new Error(`Gemini: empty search response (${candidate?.finishReason ?? "no candidates"}).`);
    const seen = new Set<string>();
    const sources = (candidate?.groundingMetadata?.groundingChunks ?? [])
      .flatMap((chunk) => (chunk.web?.uri ? [{ title: chunk.web.title ?? chunk.web.uri, url: chunk.web.uri }] : []))
      .filter((source) => !seen.has(source.url) && seen.add(source.url));
    return { answer, sources };
  }

  private async post(tier: ModelTier, body: unknown, timeoutMs?: number): Promise<GeminiResponse> {
    const model = this.models[tier];
    if (!this.apiKey) throw new Error("Gemini: GEMINI_API_KEY is not set.");
    if (!model) throw new Error(`Gemini: no model name set for the ${tier} tier.`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? GEMINI_DEFAULT_TIMEOUT_MS);
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
      return data;
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
  });
}
