import { describe, expect, test } from "vitest"
import {
  AI_TEXT_TO_SPEECH_MESSAGE_MAX_LENGTH,
  AITextToSpeechDefaultFn,
  aiTextToSpeechSchema,
} from "../src/steps/ai-text-to-speech"

describe("AI text-to-speech flow contract", () => {
  test("keeps legacy over-limit messages readable", () => {
    const legacyStep = AITextToSpeechDefaultFn({
      message: "a".repeat(AI_TEXT_TO_SPEECH_MESSAGE_MAX_LENGTH + 1),
      outputFieldId: "field-1",
    })

    expect(aiTextToSpeechSchema.safeParse(legacyStep).success).toBe(true)
  })
})
