import type { IntegrationOpenaiCompatibleModel } from "@chatbotx.io/database/types"
import { describe, expect, test, vi } from "vitest"

const providerModelMock = vi.hoisted(() => vi.fn((modelId: string) => modelId))
const createOpenAICompatibleMock = vi.hoisted(() =>
  vi.fn(() => providerModelMock),
)

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}))

const { createOpenaiCompatibleModelInstance } = await import(
  "../src/server/openai-compatible"
)

function createIntegration(
  overrides: Partial<IntegrationOpenaiCompatibleModel> = {},
): IntegrationOpenaiCompatibleModel {
  return {
    id: "1",
    auth: null,
    autoReply: false,
    baseURL: "http://localhost:1234/v1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    defaultModel: "llama-3.2-1b",
    enabled: true,
    integrationId: "10",
    name: "Local",
    preset: "lmstudio",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    workspaceId: "100",
    ...overrides,
  }
}

describe("OpenAI-compatible model helper", () => {
  test("creates a model without api key for local providers", () => {
    const result = createOpenaiCompatibleModelInstance({
      integration: createIntegration(),
      modelId: "local-model",
    })

    expect(result).toBe("local-model")
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith({
      name: "lmstudio",
      baseURL: "http://localhost:1234/v1",
      apiKey: undefined,
    })
    expect(providerModelMock).toHaveBeenCalledWith("local-model")
  })

  test("passes secret text api key", () => {
    createOpenaiCompatibleModelInstance({
      integration: createIntegration({
        auth: { authType: "secretText", secretText: "provider-key" },
        baseURL: "https://example.com/v1",
        preset: "nim",
      }),
      modelId: "deepseek-ai/deepseek-r1",
    })

    expect(createOpenAICompatibleMock).toHaveBeenLastCalledWith({
      name: "nim",
      baseURL: "https://example.com/v1",
      apiKey: "provider-key",
    })
  })

  test("passes custom provider configuration through to the SDK", () => {
    createOpenaiCompatibleModelInstance({
      integration: createIntegration({
        auth: { authType: "secretText", secretText: "woku-key" },
        baseURL: "https://llm.wokushop.com/v1",
        preset: "custom",
      }),
      modelId: "gpt-4o-mini",
    })

    expect(createOpenAICompatibleMock).toHaveBeenLastCalledWith({
      name: "custom",
      baseURL: "https://llm.wokushop.com/v1",
      apiKey: "woku-key",
    })
    expect(providerModelMock).toHaveBeenLastCalledWith("gpt-4o-mini")
  })

  test("throws a clear error for non-null invalid auth config", () => {
    expect(() =>
      createOpenaiCompatibleModelInstance({
        integration: createIntegration({
          auth: { authType: "custom", apiKey: "secret" },
        }),
        modelId: "local-model",
      }),
    ).toThrow("OpenAI-compatible provider auth config is invalid.")
  })

  test("keeps the nearai request-body transform", () => {
    createOpenaiCompatibleModelInstance({
      integration: createIntegration({
        auth: { authType: "secretText", secretText: "near-key" },
        baseURL: "https://api.near.ai/v1",
        preset: "nearai",
      }),
      modelId: "nearai-model",
    })

    const config = createOpenAICompatibleMock.mock.calls.at(-1)?.[0]
    expect(config).toMatchObject({
      name: "nearai",
      baseURL: "https://api.near.ai/v1",
      apiKey: "near-key",
    })
    expect(
      config.transformRequestBody({ reasoning_effort: "low", prompt: "x" }),
    ).toEqual({
      prompt: "x",
    })
  })
})
