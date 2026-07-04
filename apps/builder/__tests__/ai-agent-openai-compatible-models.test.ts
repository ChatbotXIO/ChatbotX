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
})
