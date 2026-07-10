import { describe, expect, test } from "vitest"
import {
  buildOpenaiCompatibleIntegrationOptions,
  buildOpenaiCompatibleModelOptions,
  shouldUseCustomOpenaiCompatibleModelInput,
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

  test("uses dedicated NIM vision models for analyze image", async () => {
    const { openaiCompatiblePresetConfigs } = await import("@chatbotx.io/ai")
    const nimConfig = openaiCompatiblePresetConfigs.nim

    expect(
      buildOpenaiCompatibleModelOptions(nimConfig, "analyzeImage").map(
        (option) => option.value,
      ),
    ).toEqual([
      "meta/llama-3.2-11b-vision-instruct",
      "nvidia/nemotron-nano-12b-v2-vl",
    ])
    expect(
      buildOpenaiCompatibleModelOptions(nimConfig, "analyzeImage"),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "deepseek-ai/deepseek-v4-pro" }),
      ]),
    )
    expect(
      shouldUseCustomOpenaiCompatibleModelInput(nimConfig, "analyzeImage"),
    ).toBe(false)
  })

  test("uses dedicated provider vision models for analyze image", async () => {
    const { openaiCompatiblePresetConfigs } = await import("@chatbotx.io/ai")

    expect(
      buildOpenaiCompatibleModelOptions(
        openaiCompatiblePresetConfigs.clarifai,
        "analyzeImage",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "https://clarifai.com/openai/chat-completion/models/gpt-4o",
        }),
        expect.objectContaining({
          value:
            "https://clarifai.com/xai/chat-completion/models/grok-2-vision-1212",
        }),
      ]),
    )
    expect(
      buildOpenaiCompatibleModelOptions(
        openaiCompatiblePresetConfigs.clarifai,
        "analyzeImage",
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value:
            "https://clarifai.com/openai/chat-completion/models/gpt-oss-120b",
        }),
      ]),
    )

    expect(
      buildOpenaiCompatibleModelOptions(
        openaiCompatiblePresetConfigs.nearai,
        "analyzeImage",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "google/gemini-2.5-flash" }),
        expect.objectContaining({
          value: "Qwen/Qwen3-VL-30B-A3B-Instruct",
        }),
      ]),
    )
    expect(
      buildOpenaiCompatibleModelOptions(
        openaiCompatiblePresetConfigs.nearai,
        "analyzeImage",
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "zai-org/GLM-5.1-FP8" }),
      ]),
    )
  })
})
