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

  async generate(): Promise<string> {
    // STUB(copilot-backend): call Gemini here with GEMINI_MODEL_FLASH or GEMINI_MODEL_PRO.
    throw new Error("Gemini client not implemented yet.");
  }
}

export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  return env.LLM_PROVIDER === "gemini" ? new GeminiClient() : new MockLlmClient();
}
