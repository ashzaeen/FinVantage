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

class GeminiClient implements LlmClient {
  readonly provider = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly models: Record<ModelTier, string>,
  ) {}

  async generate(request: LlmRequest): Promise<string> {
    const model = this.models[request.tier];
    if (!this.apiKey || !model) {
      throw new Error(`Gemini ${request.tier} model and API key must be configured.`);
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: request.jsonSchema
            ? { responseMimeType: "application/json", responseJsonSchema: request.jsonSchema }
            : undefined,
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}.`);
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!text) throw new Error("Gemini returned no text.");
    return text;
  }
}

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  return env.LLM_PROVIDER === "gemini"
    ? new GeminiClient(env.GEMINI_API_KEY ?? "", {
        flash: env.GEMINI_MODEL_FLASH ?? "",
      })
    : new MockLlmClient();
}
