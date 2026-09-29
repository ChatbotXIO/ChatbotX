import { describe, expect, test } from "vitest"
import { AIAnalyzeImageDefaultFn } from "../src/steps/ai-analyze-image"
import {
  aiExtractDataDefaultFn,
  aiExtractDataModels,
} from "../src/steps/ai-extract-data"
import { aiGenerateTextDefaultFn } from "../src/steps/ai-generate-text"
import { AISpeechToTextDefaultFn } from "../src/steps/ai-speech-to-text"

describe("AI extract data model catalog", () => {
  test("keeps defaults inside provider model lists", () => {
    for (const provider of Object.values(aiExtractDataModels)) {
      expect(provider.models).toContain(provider.default)
    }
  })

  test("does not expose stale OpenRouter extract models", () => {
    expect(aiExtractDataModels.openrouter.models).not.toContain(
      "anthropic/claude-3-5-sonnet",
    )
    expect(aiExtractDataModels.openrouter.models).not.toContain(
      "anthropic/claude-3-5-haiku",
    )
    expect(aiExtractDataModels.openrouter.models).not.toContain(
      "google/gemini-2.0-flash",
    )
  })

  test("keeps published legacy models and canonical defaults valid", () => {
    expect(aiGenerateTextDefaultFn({ provider: "deepseek" }).model).toBe(
      "deepseek-flash",
    )
    expect(aiGenerateTextDefaultFn({ model: "deepseek-v4-flash" }).model).toBe(
      "deepseek-v4-flash",
    )
    expect(aiExtractDataDefaultFn({ provider: "openai" }).model).toBe(
      aiExtractDataModels.openai.default,
    )
    expect(AIAnalyzeImageDefaultFn({ provider: "openai" }).model).toBe(
      "gpt-5.4-mini",
    )
    expect(AISpeechToTextDefaultFn({ model: "whisper-1" }).model).toBe(
      "whisper-1",
    )
  })
})
