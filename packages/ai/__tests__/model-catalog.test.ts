import { describe, expect, test, vi } from "vitest"
import {
  aiChatProviders,
  claudeAnalyzeImageModelOptions,
  claudeModelOptions,
  claudeModels,
  deepseekModels,
  geminiModelOptions,
  geminiModels,
  openaiAnalyzeImageModelOptions,
  openaiModelOptions,
  openaiModels,
  openrouterAnalyzeImageModelOptions,
  openrouterExtractFileModelOptions,
  openrouterModelOptions,
  openrouterModels,
} from "../src/models"

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: {} },
}))

const { normalizeAIModelId } = await import("../src/server/factory")

describe("AI model catalog", () => {
  test("keeps provider defaults valid", () => {
    const schemaByProvider = {
      openai: openaiModels,
      gemini: geminiModels,
      claude: claudeModels,
      deepseek: deepseekModels,
      openrouter: openrouterModels,
    }

    for (const provider of aiChatProviders) {
      expect(
        schemaByProvider[provider.provider].safeParse(provider.defaultModel)
          .success,
      ).toBe(true)
    }
  })

  test("keeps option values valid", () => {
    const optionGroups = [
      { options: openaiModelOptions, schema: openaiModels },
      { options: openaiAnalyzeImageModelOptions, schema: openaiModels },
      { options: geminiModelOptions, schema: geminiModels },
      { options: claudeModelOptions, schema: claudeModels },
      { options: claudeAnalyzeImageModelOptions, schema: claudeModels },
      { options: openrouterModelOptions, schema: openrouterModels },
      { options: openrouterAnalyzeImageModelOptions, schema: openrouterModels },
      { options: openrouterExtractFileModelOptions, schema: openrouterModels },
    ]

    for (const group of optionGroups) {
      for (const option of group.options) {
        expect(group.schema.safeParse(option.value).success).toBe(true)
      }
    }
  })

  test("does not expose known stale model ids in OpenRouter pickers", () => {
    const exposedValues = [
      ...openrouterModelOptions,
      ...openrouterAnalyzeImageModelOptions,
      ...openrouterExtractFileModelOptions,
    ].map((option) => option.value)

    expect(exposedValues).not.toContain("anthropic/claude-3-5-sonnet")
    expect(exposedValues).not.toContain("anthropic/claude-3-5-haiku")
    expect(exposedValues).not.toContain("google/gemini-2.0-flash")
    expect(exposedValues).not.toContain(
      "meta-llama/llama-3.2-90b-vision-instruct",
    )
  })

  test("normalizes legacy provider model ids before runtime calls", () => {
    expect(normalizeAIModelId("claude", "claude-4.5-sonnet-20250929")).toBe(
      "claude-sonnet-4-5-20250929",
    )
    expect(
      normalizeAIModelId("openrouter", "anthropic/claude-3-5-sonnet"),
    ).toBe("anthropic/claude-sonnet-4.5")
    expect(normalizeAIModelId("deepseek", "deepseek-chat")).toBe(
      "deepseek-v4-flash",
    )
  })
})
