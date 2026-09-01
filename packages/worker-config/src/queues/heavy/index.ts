import { aiAgentModelConfig } from "@chatbotx.io/database/partials"
import {
  aiEditImageSchema,
  aiGenerateImageSchema,
  aiSpeechToTextSchema,
  aiTextToSpeechSchema,
  metadataSchema,
} from "@chatbotx.io/flow-config"
import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const HeavyJobAction = {
  processAIFile: "processAIFile",
  aiEditImage: "aiEditImage",
  aiGenerateImage: "aiGenerateImage",
  aiSpeechToText: "aiSpeechToText",
  aiTextToSpeech: "aiTextToSpeech",
  extractTextFromFile: "extractTextFromFile",
  analyzeImage: "analyzeImage",
} as const

export type HeavyJobAction =
  (typeof HeavyJobAction)[keyof typeof HeavyJobAction]

const heavyJobProcessAIFileSchema = z.object({
  type: z.literal(HeavyJobAction.processAIFile),
  data: z.object({ aiFileId: z.string().min(1) }),
})

const heavyStepBaseDataSchema = z.object({
  conversationId: z.string().min(1),
  contactInboxId: z.string().min(1),
  metadata: metadataSchema.optional(),
})

const heavyJobAiEditImageSchema = z.object({
  type: z.literal(HeavyJobAction.aiEditImage),
  data: heavyStepBaseDataSchema.extend({
    step: aiEditImageSchema,
  }),
})

const heavyJobAiGenerateImageSchema = z.object({
  type: z.literal(HeavyJobAction.aiGenerateImage),
  data: heavyStepBaseDataSchema.extend({
    step: aiGenerateImageSchema,
  }),
})

const heavyJobAiSpeechToTextSchema = z.object({
  type: z.literal(HeavyJobAction.aiSpeechToText),
  data: heavyStepBaseDataSchema.extend({
    step: aiSpeechToTextSchema,
  }),
})

const heavyJobAiTextToSpeechSchema = z.object({
  type: z.literal(HeavyJobAction.aiTextToSpeech),
  data: heavyStepBaseDataSchema.extend({
    step: aiTextToSpeechSchema,
  }),
})

const heavyJobExtractTextFromFileSchema = z.object({
  type: z.literal(HeavyJobAction.extractTextFromFile),
  data: z.object({
    workspaceId: z.string().min(1),
    conversationId: z.string().min(1),
    attachmentId: z.string().min(1),
    originPath: z.string().min(1),
    mimeType: z.string().min(1),
    query: z.string().min(1),
  }),
})

const heavyJobAnalyzeImageSchema = z.object({
  type: z.literal(HeavyJobAction.analyzeImage),
  data: z.object({
    workspaceId: z.string().min(1),
    originPath: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    prompt: z.string().min(1),
    providerInfo: aiAgentModelConfig,
  }),
})

export const heavyJobDataSchema = z.discriminatedUnion("type", [
  heavyJobProcessAIFileSchema,
  heavyJobAiEditImageSchema,
  heavyJobAiGenerateImageSchema,
  heavyJobAiSpeechToTextSchema,
  heavyJobAiTextToSpeechSchema,
  heavyJobExtractTextFromFileSchema,
  heavyJobAnalyzeImageSchema,
])

export const heavyStepResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    outputValue: z.string().min(1),
  }),
  z.object({
    status: z.literal("error"),
    errorMessage: z.string().min(1),
  }),
])

export const heavyExtractTextFromFileResultSchema = z.object({
  snippets: z.array(z.string()),
  truncated: z.boolean(),
})

export const heavyAnalyzeImageResultSchema = z.object({
  analysis: z.string().min(1),
})

export type HeavyJobData = z.infer<typeof heavyJobDataSchema>
export type HeavyJobProcessAIFile = z.infer<typeof heavyJobProcessAIFileSchema>
export type HeavyJobAiEditImage = z.infer<typeof heavyJobAiEditImageSchema>
export type HeavyJobAiGenerateImage = z.infer<
  typeof heavyJobAiGenerateImageSchema
>
export type HeavyJobAiSpeechToText = z.infer<
  typeof heavyJobAiSpeechToTextSchema
>
export type HeavyJobAiTextToSpeech = z.infer<
  typeof heavyJobAiTextToSpeechSchema
>
export type HeavyJobExtractTextFromFile = z.infer<
  typeof heavyJobExtractTextFromFileSchema
>
export type HeavyJobAnalyzeImage = z.infer<typeof heavyJobAnalyzeImageSchema>
export type HeavyStepResultData = z.infer<typeof heavyStepResultSchema>
export type HeavyExtractTextFromFileResultData = z.infer<
  typeof heavyExtractTextFromFileResultSchema
>
export type HeavyAnalyzeImageResultData = z.infer<
  typeof heavyAnalyzeImageResultSchema
>

export const heavyQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<HeavyJobData>(queueNames.enum.heavy, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
