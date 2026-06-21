import { describe, expect, test } from "vitest"
import { aiExtractDataModels } from "../src/steps/ai-extract-data"

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
})
