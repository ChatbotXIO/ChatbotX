import { describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  anthropic: vi.fn(),
  deepseek: vi.fn(),
  google: vi.fn(),
  openai: vi.fn(),
  openrouter: vi.fn(),
}))

vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: mocks.anthropic }))
vi.mock("@ai-sdk/deepseek", () => ({ createDeepSeek: mocks.deepseek }))
vi.mock("@ai-sdk/google", () => ({ createGoogle: mocks.google }))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.openai }))
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: mocks.openrouter,
}))

const { getAIProviderInstance } = await import("../src/core/factory")

describe("getAIProviderInstance", () => {
  test("constructs the native OpenRouter provider with its configured key", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-key")

    getAIProviderInstance("openrouter")

    expect(mocks.openrouter).toHaveBeenCalledWith({ apiKey: "openrouter-key" })
  })
})
