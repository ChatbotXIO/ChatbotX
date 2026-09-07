import {
  AISpeechToTextDefaultFn,
  AITextToSpeechDefaultFn,
  aiEditImageDefaultFn,
  aiGenerateImageDefaultFn,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import {
  getHeavyJobOptions,
  HeavyJobAction,
  heavyAnalyzeImageResultSchema,
  heavyExtractTextFromFileResultSchema,
  heavyJobDataSchema,
  heavyStepResultSchema,
} from "../src/queues/heavy"

const stepBaseData = {
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
}

describe("heavyJobDataSchema", () => {
  test.each([
    {
      type: HeavyJobAction.processAIFile,
      data: { aiFileId: "ai-file-1" },
    },
    {
      type: HeavyJobAction.aiEditImage,
      data: {
        ...stepBaseData,
        step: aiEditImageDefaultFn({
          id: "1",
          inputFieldId: "custom-field-input",
          prompt: "Make it brighter",
          outputFieldId: "custom-field-output",
        }),
      },
    },
    {
      type: HeavyJobAction.aiGenerateImage,
      data: {
        ...stepBaseData,
        step: aiGenerateImageDefaultFn({
          id: "2",
          prompt: "A quiet workspace",
          outputFieldId: "custom-field-output",
        }),
      },
    },
    {
      type: HeavyJobAction.aiSpeechToText,
      data: {
        ...stepBaseData,
        step: AISpeechToTextDefaultFn({
          id: "3",
          inputFieldId: "custom-field-audio",
          outputFieldId: "custom-field-output",
        }),
      },
    },
    {
      type: HeavyJobAction.aiTextToSpeech,
      data: {
        ...stepBaseData,
        step: AITextToSpeechDefaultFn({
          id: "4",
          message: "Xin chao",
          outputFieldId: "custom-field-output",
        }),
      },
    },
    {
      type: HeavyJobAction.extractTextFromFile,
      data: {
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        attachmentId: "attachment-1",
        originPath: "workspace-1/files/manual.pdf",
        mimeType: "application/pdf",
        query: "refund policy",
      },
    },
    {
      type: HeavyJobAction.analyzeImage,
      data: {
        workspaceId: "workspace-1",
        originPath: "workspace-1/images/photo.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        prompt: "Describe this image",
        providerInfo: { provider: "openai", model: "gpt-4o-mini" },
      },
    },
  ])("parses $type payloads", (jobData) => {
    expect(heavyJobDataSchema.parse(jobData)).toEqual(jobData)
  })

  test("rejects model-shaped identifiers at the Redis boundary", () => {
    expect(
      heavyJobDataSchema.safeParse({
        type: HeavyJobAction.aiGenerateImage,
        data: {
          conversationId: { id: "conversation-1" },
          contactInboxId: "contact-inbox-1",
          step: aiGenerateImageDefaultFn({
            prompt: "A quiet workspace",
            outputFieldId: "custom-field-output",
          }),
        },
      }).success,
    ).toBe(false)
  })

  test("accepts a durable continuation for a flow-owned heavy step", () => {
    expect(
      heavyJobDataSchema.safeParse({
        type: HeavyJobAction.aiGenerateImage,
        data: {
          ...stepBaseData,
          outcomeKey: "heavy-step-outcome-1",
          continuation: {
            flowExecutionKey: "flow-execution-1",
            flowId: "flow-1",
            flowVersionId: "flow-version-1",
            nodeId: "node-1",
          },
          step: aiGenerateImageDefaultFn({
            id: "2",
            prompt: "A quiet workspace",
            outputFieldId: "custom-field-output",
          }),
        },
      }).success,
    ).toBe(true)
  })

  test("validates full openai-compatible provider config for image analysis", () => {
    expect(
      heavyJobDataSchema.parse({
        type: HeavyJobAction.analyzeImage,
        data: {
          workspaceId: "workspace-1",
          originPath: "workspace-1/images/photo.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          prompt: "Describe this image",
          providerInfo: {
            kind: "openaiCompatible",
            integrationId: "integration-1",
            model: "custom-model",
          },
        },
      }),
    ).toEqual({
      type: HeavyJobAction.analyzeImage,
      data: {
        workspaceId: "workspace-1",
        originPath: "workspace-1/images/photo.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        prompt: "Describe this image",
        providerInfo: {
          kind: "openaiCompatible",
          integrationId: "integration-1",
          model: "custom-model",
        },
      },
    })

    expect(
      heavyJobDataSchema.safeParse({
        type: HeavyJobAction.analyzeImage,
        data: {
          workspaceId: "workspace-1",
          originPath: "workspace-1/images/photo.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          prompt: "Describe this image",
          providerInfo: { provider: "openai", modelId: "gpt-4o-mini" },
        },
      }).success,
    ).toBe(false)
  })
})

describe("heavy result schemas", () => {
  test("requires outputValue for successful flow-step results", () => {
    expect(
      heavyStepResultSchema.parse({
        status: "success",
        outputValue: "https://cdn.example.com/result.png",
      }),
    ).toEqual({
      status: "success",
      outputValue: "https://cdn.example.com/result.png",
    })

    expect(heavyStepResultSchema.safeParse({ status: "success" }).success).toBe(
      false,
    )
  })

  test("requires errorMessage for failed flow-step results", () => {
    expect(
      heavyStepResultSchema.parse({
        status: "error",
        errorMessage: "Provider failed",
      }),
    ).toEqual({
      status: "error",
      errorMessage: "Provider failed",
    })

    expect(heavyStepResultSchema.safeParse({ status: "error" }).success).toBe(
      false,
    )
  })

  test("keeps tool results bounded and separate from flow-step results", () => {
    expect(
      heavyExtractTextFromFileResultSchema.parse({
        snippets: ["Matched paragraph"],
        truncated: true,
      }),
    ).toEqual({ snippets: ["Matched paragraph"], truncated: true })

    expect(
      heavyAnalyzeImageResultSchema.parse({ analysis: "A product photo" }),
    ).toEqual({ analysis: "A product photo" })
  })
})

describe("heavy job policies", () => {
  test("uses longer retry budget for AI file processing", () => {
    expect(getHeavyJobOptions(HeavyJobAction.processAIFile)).toEqual(
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      }),
    )
  })

  test("keeps paid media retries bounded with a longer backoff", () => {
    expect(getHeavyJobOptions(HeavyJobAction.aiGenerateImage)).toEqual(
      expect.objectContaining({
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
      }),
    )
  })
})
