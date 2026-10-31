import { describe, expect, test } from "vitest"
import {
  AIAnalyzeImageDefaultFn,
  aiAnalyzeImageSchema,
} from "../src/steps/ai-analyze-image"
import {
  aiDeleteMessageHistoryDefaultFn,
  aiDeleteMessageHistorySchema,
} from "../src/steps/ai-delete-message-history"
import {
  aiEditImageDefaultFn,
  aiEditImageSchema,
} from "../src/steps/ai-edit-image"
import {
  aiExtractDataDefaultFn,
  aiExtractDataSchema,
} from "../src/steps/ai-extract-data"
import {
  aiGenerateImageDefaultFn,
  aiGenerateImageSchema,
} from "../src/steps/ai-generate-image"
import {
  aiGenerateTextDefaultFn,
  aiGenerateTextSchema,
  MUSE_MAX_TEMPERATURE,
} from "../src/steps/ai-generate-text"
import {
  aiGenerateTextAgentDefaultFn,
  aiGenerateTextAgentSchema,
} from "../src/steps/ai-generate-text-agent"

describe("Muse AI flow steps", () => {
  test("parses every AI step with the muse provider", () => {
    const steps = [
      aiGenerateTextSchema.parse(
        aiGenerateTextDefaultFn({
          provider: "muse",
          text: "Summarize",
          outputFieldId: "1",
        }),
      ),
      aiAnalyzeImageSchema.parse(
        AIAnalyzeImageDefaultFn({
          provider: "muse",
          prompt: "Describe",
          inputFieldId: "1",
          outputFieldId: "2",
        }),
      ),
      aiExtractDataSchema.parse(
        aiExtractDataDefaultFn({ provider: "muse", inputFieldId: "1" }),
      ),
      aiDeleteMessageHistorySchema.parse(
        aiDeleteMessageHistoryDefaultFn({ provider: "muse" }),
      ),
    ]

    for (const step of steps) {
      expect(step.provider).toBe("muse")
    }
  })

  test("rejects a muse temperature above the Muse maximum", () => {
    const text = aiGenerateTextDefaultFn({
      provider: "muse",
      text: "Summarize",
      outputFieldId: "1",
    })
    const image = AIAnalyzeImageDefaultFn({
      provider: "muse",
      prompt: "Describe",
      inputFieldId: "1",
      outputFieldId: "2",
    })

    for (const result of [
      aiGenerateTextSchema.safeParse({ ...text, temperature: 1.5 }),
      aiAnalyzeImageSchema.safeParse({ ...image, temperature: 1.5 }),
    ]) {
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual(["temperature"])
    }
    expect(
      aiGenerateTextSchema.safeParse({
        ...text,
        temperature: MUSE_MAX_TEMPERATURE,
      }).success,
    ).toBe(true)
    expect(
      aiGenerateTextSchema.safeParse({
        ...text,
        provider: "openai",
        model: "gpt-5.4-mini",
        temperature: 1.5,
      }).success,
    ).toBe(true)
  })

  test("keeps muse on the agent step instead of catching to openai", () => {
    const step = aiGenerateTextAgentSchema.parse(
      aiGenerateTextAgentDefaultFn({
        provider: "muse",
        aiAgentId: "1",
        message: "Hello",
        outputFieldId: "1",
      }),
    )

    expect(step.provider).toBe("muse")
  })

  test("defaults the Muse image steps to muse-image-1.0 without size or quality", () => {
    const generated = aiGenerateImageSchema.parse(
      aiGenerateImageDefaultFn({
        provider: "muse",
        prompt: "A red apple",
        outputFieldId: "1",
      }),
    )
    const edited = aiEditImageSchema.parse(
      aiEditImageDefaultFn({
        provider: "muse",
        inputFieldId: "1",
        prompt: "Make it blue",
        outputFieldId: "2",
      }),
    )

    expect(generated).toMatchObject({
      provider: "muse",
      model: "muse-image-1.0",
      size: "auto",
      quality: "auto",
    })
    expect(edited).toMatchObject({
      provider: "muse",
      model: "muse-image-1.0",
      size: "auto",
      quality: "auto",
    })
  })
})
