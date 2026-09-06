import { aiAgentModelConfig } from "@chatbotx.io/database/partials"
import {
  aiEditImageSchema,
  aiGenerateImageSchema,
  aiSpeechToTextSchema,
  aiTextToSpeechSchema,
  type FlowActionTargetType,
  metadataSchema,
} from "@chatbotx.io/flow-config"
import type { CommentAnchor } from "@chatbotx.io/sdk"
import { type JobsOptions, Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"
import type { BotResponseTrackingContext } from "../types"

export type HeavyFlowContinuation = {
  appointmentId?: string
  commentAnchor?: CommentAnchor
  flowExecutionKey: string
  flowId: string
  flowVersionId?: string
  metadata?: z.infer<typeof metadataSchema>
  nodeId?: string
  nodeVisits?: Record<string, number>
  sendFrom?: "inbox"
  targetId?: string
  targetType?: FlowActionTargetType
  trackingContext?: BotResponseTrackingContext
}

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

const heavyJobOptionsByAction: Record<HeavyJobAction, JobsOptions> = {
  [HeavyJobAction.processAIFile]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
  [HeavyJobAction.aiEditImage]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [HeavyJobAction.aiGenerateImage]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [HeavyJobAction.aiSpeechToText]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [HeavyJobAction.aiTextToSpeech]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [HeavyJobAction.extractTextFromFile]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
  [HeavyJobAction.analyzeImage]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
}

export function getHeavyJobOptions(action: HeavyJobAction): JobsOptions {
  return { ...heavyJobOptionsByAction[action] }
}

// Extra time for QueueEvents delivery and worker handoff after the final
// provider attempt. This is part of the caller-side deadline, not provider
// execution time.
const HEAVY_JOB_COMPLETION_WAIT_BUFFER_MS = 60_000

function getTotalBackoffDelayMs(options: JobsOptions): number {
  const retryCount = Math.max((options.attempts ?? 1) - 1, 0)
  if (retryCount === 0 || !options.backoff) {
    return 0
  }

  if (typeof options.backoff === "number") {
    return options.backoff * retryCount
  }

  const delay = options.backoff.delay ?? 0
  if (options.backoff.type !== "exponential") {
    return delay * retryCount
  }

  return Array.from(
    { length: retryCount },
    (_, retryIndex) => delay * 2 ** retryIndex,
  ).reduce((total, delayMs) => total + delayMs, 0)
}

/**
 * Returns the bounded caller-side wait for all configured attempts, BullMQ
 * backoff, and QueueEvents handoff. `attemptTimeoutMs` remains the limit for
 * one provider call; it must never be reused as the whole job deadline.
 */
export function getHeavyJobCompletionWaitTimeoutMs(
  action: HeavyJobAction,
  attemptTimeoutMs: number,
): number {
  const options = heavyJobOptionsByAction[action]
  const attempts = options.attempts ?? 1

  return (
    attempts * attemptTimeoutMs +
    getTotalBackoffDelayMs(options) +
    HEAVY_JOB_COMPLETION_WAIT_BUFFER_MS
  )
}

const heavyJobProcessAIFileSchema = z.object({
  type: z.literal(HeavyJobAction.processAIFile),
  data: z.object({ aiFileId: z.string().min(1) }),
})

const heavyFlowContinuationSchema = z
  .object({
    flowExecutionKey: z.string().min(1),
    flowId: z.string().min(1),
    flowVersionId: z.string().min(1).optional(),
    nodeId: z.string().min(1).optional(),
    targetId: z.string().min(1).optional(),
    targetType: z.enum(["button", "quickReply"]).optional(),
    metadata: metadataSchema.optional(),
    appointmentId: z.string().min(1).optional(),
    sendFrom: z.literal("inbox").optional(),
    nodeVisits: z.record(z.string(), z.number().int().nonnegative()).optional(),
    commentAnchor: z
      .object({
        commentId: z.string().min(1),
        replyChannel: z.enum(["public", "private"]),
      })
      .optional(),
    trackingContext: z
      .object({
        aiProvider: z.string().min(1),
        conversationId: z.string().min(1),
        messageId: z.string().min(1),
        responseType: z.string().min(1),
        startTime: z.number(),
        triggerType: z.string().min(1),
        workspaceId: z.string().min(1),
      })
      .optional(),
  })
  .transform((value) => value as HeavyFlowContinuation)

const heavyStepBaseDataSchema = z.object({
  conversationId: z.string().min(1),
  contactInboxId: z.string().min(1),
  metadata: metadataSchema.optional(),
  outcomeKey: z.string().min(1).optional(),
  continuation: heavyFlowContinuationSchema.optional(),
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

/**
 * Workload-class queue for bounded but RAM/CPU/I/O/model-heavy jobs. It is
 * intentionally not tied to one product domain: callers enqueue work here when
 * running it on a latency-sensitive worker would consume too much capacity.
 */
export const heavyQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<HeavyJobData>(queueNames.enum.heavy, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
