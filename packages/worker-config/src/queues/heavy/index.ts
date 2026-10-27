import { aiAgentModelConfig } from "@chatbotx.io/database/partials"
import {
  aiEditImageSchema,
  aiGenerateImageSchema,
  aiSpeechToTextSchema,
  aiTextToSpeechSchema,
  type FlowActionTargetType,
  metadataSchema,
} from "@chatbotx.io/flow-config"
import { getChildLogger } from "@chatbotx.io/logger"
import type { CommentAnchor } from "@chatbotx.io/sdk"
import { isStoredImageOptimizationEnabled } from "@chatbotx.io/utils/image-optimize-settings"
import { type JobsOptions, Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
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
  sentByUserId?: string
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
  optimizeStoredImage: "optimizeStoredImage",
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
  [HeavyJobAction.optimizeStoredImage]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 60_000 },
    // The enqueue can run inside a caller-owned transaction; the job re-reads
    // the row, so give that transaction time to commit before it looks.
    delay: 5000,
    // Background storage savings: any flow-blocking heavy job (no priority,
    // so BullMQ's highest) is always picked first.
    priority: 1000,
    // Retained by age so a webhook redelivery within the hour dedupes onto
    // the same jobId instead of re-encoding.
    removeOnComplete: { age: 60 * 60, count: 1000 },
    removeOnFail: { count: 1000 },
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
  data: z.object({
    aiFileId: z.string().min(1),
    runId: z.string().min(1).optional(),
  }),
})

/** Job ids are retained by BullMQ, so a reindex run must never reuse one. */
export function buildAIFileReindexJobId(
  aiFileId: string,
  runId: string,
): string {
  return `heavy-ai-file-${aiFileId}-reindex-${runId}`
}

/** Keep old ids stable; a reindex adds its run to avoid retained-job dedupe. */
export function buildAIFileEmbeddingJobId(input: {
  aiFileId: string
  embeddingId: string
  runId?: string
}): string {
  const base = `ai-file-embedding-${input.aiFileId}-${input.embeddingId}`
  return input.runId ? `${base}-r${input.runId}` : base
}

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
    sentByUserId: z.string().min(1).optional(),
    nodeVisits: z.record(z.string(), z.number().int().nonnegative()).optional(),
    // Must mirror every field of `CommentAnchor`. Zod strips unknown keys, so
    // an omitted field is silently dropped on the way back out of the heavy
    // queue — and the `.transform(... as HeavyFlowContinuation)` below hides
    // the mismatch from the compiler. Dropping `spent` un-spends a claimed
    // anchor: the next message-producing step sees `!spent`, re-claims it, and
    // fires a second comment_id-anchored DM that Meta rejects with "The
    // comment is invalid for a private reply".
    commentAnchor: z
      .object({
        commentId: z.string().min(1),
        replyChannel: z.enum(["public", "private"]),
        automationId: z.string().min(1).optional(),
        spent: z.boolean().optional(),
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

const heavyJobOptimizeStoredImageSchema = z.object({
  type: z.literal(HeavyJobAction.optimizeStoredImage),
  data: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("attachment"),
      workspaceId: z.string().min(1),
      objectKey: z.string().min(1),
      attachmentId: z.string().min(1),
      attachmentCreatedAt: z.string().min(1),
      messageCreatedAt: z.string().min(1).optional(),
    }),
    z.object({
      kind: z.literal("avatar"),
      workspaceId: z.string().min(1),
      objectKey: z.string().min(1),
      contactId: z.string().min(1),
    }),
  ]),
})

export const heavyJobDataSchema = z.discriminatedUnion("type", [
  heavyJobProcessAIFileSchema,
  heavyJobAiEditImageSchema,
  heavyJobAiGenerateImageSchema,
  heavyJobAiSpeechToTextSchema,
  heavyJobAiTextToSpeechSchema,
  heavyJobExtractTextFromFileSchema,
  heavyJobAnalyzeImageSchema,
  heavyJobOptimizeStoredImageSchema,
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
export type HeavyJobOptimizeStoredImage = z.infer<
  typeof heavyJobOptimizeStoredImageSchema
>
export type StoredImageOptimization = HeavyJobOptimizeStoredImage["data"]
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
      connection: getQueueConnection(queueNames.enum.heavy),
      defaultJobOptions,
    })

// `https:`, `wa-media:`, `failed:` … — a reference, not an object key.
const URI_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i

// Where our key layouts put the owning workspace id:
//   public/ws/<ws>/…  public/space/<ws>/…  public/<channel>/<ws>/…
//   workspace/<channel>/<ws>/…                       → segment 2
//   public/space/public/ws/<ws>/…  (legacy Messenger avatars) → segment 4
const LEGACY_AVATAR_PREFIX = ["public", "space", "public", "ws"] as const

/**
 * A key is ours only when the owning workspace id sits where our key layouts
 * put it — not merely anywhere in the path: a member of another workspace can
 * upload `public/space/<theirs>/<any suffix>` and name a victim's id inside
 * the suffix. `Contact.avatar` can be set to an arbitrary string through the
 * public API, so without this check a crafted value would make the
 * optimization job overwrite another tenant's object in place.
 */
// Every key we generate is made of these segments (ids, dates, channel and
// folder names). Anything else — `..`, `.`, an empty segment, an encoded or
// spaced name — is read literally here but could be normalised by a storage
// layer or proxy onto a different key, so it is never treated as ours.
const LITERAL_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/
const isLiteralSegment = (segment: string): boolean =>
  segment !== "." && segment !== ".." && LITERAL_SEGMENT_PATTERN.test(segment)

const isWorkspaceStorageKey = (key: string, workspaceId: string): boolean => {
  if (workspaceId.length === 0) {
    return false
  }
  const segments = key.split("/")
  if (!segments.every(isLiteralSegment)) {
    return false
  }
  if (segments[2] === workspaceId) {
    return true
  }
  return (
    LEGACY_AVATAR_PREFIX.every((part, index) => segments[index] === part) &&
    segments[4] === workspaceId
  )
}

/**
 * Only an extension-less object key the workspace owns is re-encoded in
 * place: the URL stays valid for anything that already holds it, and no
 * `.png`/`.jpg` name ends up describing a body of a different format.
 * External URLs, pending `wa-media:`/`failed:` markers and `?time=` sentinels
 * are not objects.
 */
export const isOptimizableStorageKey = (
  key: string | null | undefined,
  workspaceId: string,
) => {
  if (!key || URI_SCHEME_PATTERN.test(key) || key.includes("?")) {
    return false
  }
  const fileName = key.slice(key.lastIndexOf("/") + 1)
  return (
    fileName.length > 0 &&
    !fileName.includes(".") &&
    isWorkspaceStorageKey(key, workspaceId)
  )
}

// Where avatars are stored: `…/avatars/<id>` (channel profile pictures) and
// `…/contacts/<contactId>/avatar/<id>` (avatars imported from a URL).
const AVATAR_SEGMENTS = new Set(["avatars", "avatar"])

/**
 * `Contact.avatar` is settable through the public API, so an avatar job may
 * only rewrite an object stored as an avatar — never a logo, a webchat upload
 * or a media-library file of the same workspace, which it would otherwise
 * shrink to a 256px WebP in place. Attachment keys come from our own rows.
 */
export const isStoredImageOptimizationTarget = (
  job: StoredImageOptimization,
): boolean =>
  isWorkspaceStorageKey(job.objectKey, job.workspaceId) &&
  (job.kind !== "avatar" ||
    job.objectKey.split("/").some((segment) => AVATAR_SEGMENTS.has(segment)))

const storedImageLogger = getChildLogger("stored-image-optimization")

const storedImageOptimizationJobId = (job: StoredImageOptimization) =>
  job.kind === "attachment"
    ? `optimize-image-attachment-${job.attachmentId}`
    : `optimize-image-avatar-${job.contactId}-${job.objectKey.slice(job.objectKey.lastIndexOf("/") + 1)}`

/**
 * Queues background re-encodes of freshly stored images. Callers sit on hot
 * paths (webhook ingestion, contact writes), so this never throws: losing a
 * storage optimization must not fail the write that triggered it.
 */
export async function enqueueStoredImageOptimizations(
  jobs: StoredImageOptimization[],
): Promise<void> {
  if (!isStoredImageOptimizationEnabled()) {
    return
  }
  const eligible = jobs.filter(
    (job) =>
      isOptimizableStorageKey(job.objectKey, job.workspaceId) &&
      isStoredImageOptimizationTarget(job),
  )
  if (eligible.length === 0) {
    return
  }
  try {
    await heavyQueue.addBulk(
      eligible.map((data) => ({
        name: HeavyJobAction.optimizeStoredImage,
        data: { type: HeavyJobAction.optimizeStoredImage, data },
        opts: {
          ...getHeavyJobOptions(HeavyJobAction.optimizeStoredImage),
          jobId: storedImageOptimizationJobId(data),
        },
      })),
    )
  } catch (err) {
    // Best-effort: the image stays stored at its original size.
    storedImageLogger.warn(
      { err, count: eligible.length },
      "Failed to enqueue stored image optimization",
    )
  }
}
