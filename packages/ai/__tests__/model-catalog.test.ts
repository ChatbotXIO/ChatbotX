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

  test("does not accept retired or malformed native Claude model ids", () => {
    const retiredOrMalformedIds = [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
      "claude-opus-4.6",
      "claude-4.5-haiku-20251001",
      "claude-4.5-sonnet-20250929",
      "claude-4.5-opus-20251101",
    ]

    const exposedValues = [
      ...claudeModelOptions,
      ...claudeAnalyzeImageModelOptions,
    ].map((option) => option.value)

    for (const modelId of retiredOrMalformedIds) {
      expect(claudeModels.safeParse(modelId).success).toBe(false)
      expect(exposedValues).not.toContain(modelId)
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
    expect(() => normalizeAIModelId("deepseek", "deepseek-chat")).toThrow(
      "requires a mode-aware migration",
    )
  })

  test("normalizes every safely migratable persisted model id", () => {
    const migrations = [
      ["claude", "claude-3-5-sonnet-20241022", "claude-sonnet-4-6"],
      ["claude", "claude-3-5-haiku-20241022", "claude-haiku-4-5-20251001"],
      ["claude", "claude-3-opus-20240229", "claude-opus-4-8"],
      ["gemini", "gemini-3-flash", "gemini-3.5-flash"],
      ["gemini", "gemini-2.5-flash-lite", "gemini-3.5-flash"],
      ["gemini", "gemini-2.5-flash", "gemini-3.5-flash"],
      ["gemini", "gemini-2.5-pro", "gemini-3.5-flash"],
      ["gemini", "gemini-3.1-flash-image-preview", "gemini-3.1-flash-image"],
      ["openrouter", "google/gemini-2.5-pro-preview", "google/gemini-2.5-pro"],
    ] as const

    for (const [provider, legacyId, canonicalId] of migrations) {
      expect(normalizeAIModelId(provider, legacyId)).toBe(canonicalId)
      expect(normalizeAIModelId(provider, canonicalId)).toBe(canonicalId)
    }
  })
})
