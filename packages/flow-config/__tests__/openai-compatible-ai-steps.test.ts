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
  aiExtractDataDefaultFn,
  aiExtractDataSchema,
} from "../src/steps/ai-extract-data"
import {
  aiGenerateTextDefaultFn,
  aiGenerateTextSchema,
} from "../src/steps/ai-generate-text"
import {
  aiGenerateTextAgentDefaultFn,
  aiGenerateTextAgentSchema,
} from "../src/steps/ai-generate-text-agent"

describe("OpenAI-compatible AI flow steps", () => {
  test("keeps native generate text parsing unchanged", () => {
    const step = aiGenerateTextDefaultFn({
      model: "gpt-5.4-mini",
      outputFieldId: "field-1",
      text: "Summarize this",
    })

    expect(aiGenerateTextSchema.safeParse(step).success).toBe(true)
  })

  test("accepts OpenAI-compatible generate text with integration and model", () => {
    const step = aiGenerateTextDefaultFn({
      provider: "openaiCompatible",
      integrationId: "integration-1",
      model: "local-model",
      outputFieldId: "field-1",
      text: "Summarize this",
    })

    expect(aiGenerateTextSchema.safeParse(step).success).toBe(true)
  })

  test("rejects OpenAI-compatible generate text without integration or model", () => {
    const step = aiGenerateTextDefaultFn({
      provider: "openaiCompatible",
      outputFieldId: "field-1",
      text: "Summarize this",
    })

    expect(aiGenerateTextSchema.safeParse(step).success).toBe(false)
  })

  test("creates OpenAI-compatible draft defaults without native model lookup", () => {
    expect(
      aiGenerateTextDefaultFn({
        provider: "openaiCompatible",
      }),
    ).toMatchObject({
      provider: "openaiCompatible",
      integrationId: "",
      model: "",
    })
  })

  test("accepts OpenAI-compatible analyze image and extract data configs", () => {
    expect(
      aiAnalyzeImageSchema.safeParse(
        AIAnalyzeImageDefaultFn({
          provider: "openaiCompatible",
          integrationId: "integration-1",
          model: "vision-model",
          inputFieldId: "image-field",
          outputFieldId: "output-field",
          prompt: "Describe this image",
        }),
      ).success,
    ).toBe(true)

    expect(
      aiExtractDataSchema.safeParse(
        aiExtractDataDefaultFn({
          provider: "openaiCompatible",
          integrationId: "integration-1",
          model: "structured-model",
          inputFieldId: "input-field",
          extractFields: [{ key: "email", customFieldId: "email-field" }],
        }),
      ).success,
    ).toBe(true)
  })

  test("rejects OpenAI-compatible analyze image and extract data without integration", () => {
    expect(
      aiAnalyzeImageSchema.safeParse(
        AIAnalyzeImageDefaultFn({
          provider: "openaiCompatible",
          model: "vision-model",
          inputFieldId: "image-field",
          outputFieldId: "output-field",
          prompt: "Describe this image",
        }),
      ).success,
    ).toBe(false)

    expect(
      aiExtractDataSchema.safeParse(
        aiExtractDataDefaultFn({
          provider: "openaiCompatible",
          model: "structured-model",
          inputFieldId: "input-field",
          extractFields: [{ key: "email", customFieldId: "email-field" }],
        }),
      ).success,
    ).toBe(false)
  })

  test("accepts OpenAI-compatible generate text agent with integration and model", () => {
    const step = aiGenerateTextAgentDefaultFn({
      provider: "openaiCompatible",
      integrationId: "integration-1",
      model: "agent-model",
      aiAgentId: "agent-1",
      message: "Reply from this message",
      outputFieldId: "output-field",
    })

    expect(aiGenerateTextAgentSchema.safeParse(step).success).toBe(true)
  })

  test("rejects OpenAI-compatible generate text agent without integration or model", () => {
    const step = aiGenerateTextAgentDefaultFn({
      provider: "openaiCompatible",
      aiAgentId: "agent-1",
      message: "Reply from this message",
      outputFieldId: "output-field",
    })

    expect(aiGenerateTextAgentSchema.safeParse(step).success).toBe(false)
  })

  test("accepts OpenAI-compatible delete message history without model config", () => {
    const step = aiDeleteMessageHistoryDefaultFn({
      provider: "openaiCompatible",
    })

    expect(aiDeleteMessageHistorySchema.safeParse(step).success).toBe(true)
  })
})
