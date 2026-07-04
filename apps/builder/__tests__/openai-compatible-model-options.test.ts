import { describe, expect, test } from "vitest"
import {
  buildOpenaiCompatibleIntegrationOptions,
  buildOpenaiCompatibleModelOptions,
} from "@/features/integration-openai-compatible/model-options"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schemas/resource"

function createIntegration(
  overrides: Partial<IntegrationOpenaiCompatibleResource> = {},
): IntegrationOpenaiCompatibleResource {
  return {
    id: "custom-1",
    autoReply: false,
    baseURL: "https://llm.example.com/v1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    defaultModel: "custom-model",
    enabled: true,
    name: "Local Gateway",
    preset: "custom",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    workspaceId: "workspace-1",
    ...overrides,
  }
}

describe("OpenAI-compatible model options", () => {
  test("keeps preset providers above custom providers", () => {
    const options = buildOpenaiCompatibleIntegrationOptions({
      integrations: [
        createIntegration({ id: "custom-1", name: "Local Gateway" }),
        createIntegration({
          id: "nim-1",
          name: "NVIDIA NIM",
          preset: "nim",
        }),
        createIntegration({
          id: "heroku-1",
          name: "Heroku",
          preset: "heroku",
        }),
        createIntegration({ id: "custom-2", name: "Internal Proxy" }),
      ],
    })

    expect(options.map((option) => option.label)).toEqual([
      "NVIDIA NIM",
      "Heroku",
      "Custom - Local Gateway",
      "Custom - Internal Proxy",
    ])
  })

  test("marks disabled providers", () => {
    const options = buildOpenaiCompatibleIntegrationOptions({
      integrations: [
        createIntegration({
          id: "nim-1",
          name: "NVIDIA NIM",
          preset: "nim",
        }),
        createIntegration({ id: "custom-1", enabled: false }),
        createIntegration({
          id: "heroku-1",
          name: "Heroku",
          preset: "heroku",
        }),
      ],
    })

    expect(options).toMatchObject([
      { value: "nim-1", disabled: false },
      { value: "heroku-1", disabled: false },
      { value: "custom-1", disabled: true },
    ])
  })

  test("returns no model options when preset config is missing", () => {
    expect(buildOpenaiCompatibleModelOptions(undefined)).toEqual([])
  })
})
