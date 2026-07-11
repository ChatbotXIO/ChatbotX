import type { AIAgentProviderModels } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { buildOpenaiCompatibleAgentModels } from "@/features/ai-agents/openai-compatible-models"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schemas/resource"

function createIntegration(
  overrides: Partial<IntegrationOpenaiCompatibleResource> = {},
): IntegrationOpenaiCompatibleResource {
  return {
    id: "custom-1",
    autoReply: false,
    baseURL: "https://llm.wokushop.com/v1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    defaultModel: "custom-default-model",
    enabled: true,
    name: "Custom",
    preset: "custom",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    workspaceId: "workspace-1",
    ...overrides,
  }
}

describe("buildOpenaiCompatibleAgentModels", () => {
  test("creates a default model row for custom providers", () => {
    expect(
      buildOpenaiCompatibleAgentModels({
        integrations: [createIntegration()],
      }),
    ).toEqual([
      {
        kind: "openaiCompatible",
        integrationId: "custom-1",
        model: "custom-default-model",
      },
    ])
  })

  test("keeps the stored custom provider model id", () => {
    const storedModels: AIAgentProviderModels = [
      {
        kind: "openaiCompatible",
        integrationId: "custom-1",
        model: "claude-sonnet-4-6",
      },
    ]

    expect(
      buildOpenaiCompatibleAgentModels({
        integrations: [createIntegration()],
        storedModels,
      }),
    ).toEqual([
      {
        kind: "openaiCompatible",
        integrationId: "custom-1",
        model: "claude-sonnet-4-6",
      },
    ])
  })

  test("excludes disabled integrations from new default models", () => {
    expect(
      buildOpenaiCompatibleAgentModels({
        integrations: [createIntegration({ enabled: false })],
      }),
    ).toEqual([])
  })

  test("preserves stored disabled integration models during edit normalization", () => {
    const storedModels: AIAgentProviderModels = [
      {
        kind: "openaiCompatible",
        integrationId: "custom-1",
        model: "stored-disabled-model",
      },
    ]

    expect(
      buildOpenaiCompatibleAgentModels({
        integrations: [createIntegration({ enabled: false })],
        storedModels,
      }),
    ).toEqual([
      {
        kind: "openaiCompatible",
        integrationId: "custom-1",
        model: "stored-disabled-model",
      },
    ])
  })

  test("keeps preset providers above custom providers", () => {
    expect(
      buildOpenaiCompatibleAgentModels({
        integrations: [
          createIntegration({ id: "custom-1", name: "Local Gateway" }),
          createIntegration({
            id: "nim-1",
            defaultModel: "nim-default-model",
            name: "NVIDIA NIM",
            preset: "nim",
          }),
          createIntegration({ id: "custom-2", name: "Internal Proxy" }),
          createIntegration({
            id: "heroku-1",
            defaultModel: "heroku-default-model",
            name: "Heroku",
            preset: "heroku",
          }),
        ],
      }).map((model) => model.integrationId),
    ).toEqual(["nim-1", "heroku-1", "custom-1", "custom-2"])
  })
})
