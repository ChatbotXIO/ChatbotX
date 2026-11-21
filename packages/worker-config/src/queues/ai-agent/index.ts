import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"
import type { IntegrationJobProcessCommentAutomation } from "../integration"

export const AI_FILES_DEFAULT_CHUNK_SIZE = 1000
export const AI_FILES_DEFAULT_OVERLAP_SIZE = 200

/**
 * BullMQ priority for the per-chunk embedding jobs of an AI file. Every chunk
 * is its own job on the shared `aiAgent` queue, so a file with thousands of
 * chunks would otherwise hold live conversation replies behind it. Jobs
 * without a priority run first. Same band as `BROADCAST_SEND_PRIORITY` and
 * ahead of `MISSED_COMMENT_REPLAY_PRIORITY`: knowledge a user just uploaded is
 * wanted sooner than catch-up replays.
 */
export const AI_FILE_EMBEDDING_PRIORITY = 5

/**
 * BullMQ priority of an Inbox translation job on the shared `aiAgent` queue.
 * Jobs without a priority run first, so an AI reply (which has none) is always
 * served before a translation; 3 still runs ahead of file-embedding chunks
 * (`AI_FILE_EMBEDDING_PRIORITY`, 5), so an agent waiting on a translation never
 * sits behind thousands of chunks.
 */
export const TRANSLATION_JOB_PRIORITY = 3

/** Most messages one translation request (and so one job) may carry. */
export const TRANSLATION_JOB_MAX_MESSAGES = 20

export const AIJobAction = {
  processAIFile: "processAIFile",
  processPendingEmbedding: "processPendingEmbedding",
  summarizeConversation: "summarizeConversation",
  processConversationSource: "processConversationSource",
  processConversationSourceEmbedding: "processConversationSourceEmbedding",
  processAutomatedResponse: "processAutomatedResponse",
  processHandoffReentry: "processHandoffReentry",
  commentAIReply: "commentAIReply",
  commentModeration: "commentModeration",
  processStoryReplyAutomation: "processStoryReplyAutomation",
  processStoryMentionAutomation: "processStoryMentionAutomation",
  translateMessages: "translateMessages",
} as const

export const aiJobSummarizeConversationDataSchema = z.object({
  conversationId: z.string().min(1),
})

const aiJobProcessFileSchema = z.object({
  type: z.literal(AIJobAction.processAIFile),
  data: z.object({ aiFileId: z.string().min(1) }),
})

const aiJobProcessPendingEmbeddingSchema = z.object({
  type: z.literal(AIJobAction.processPendingEmbedding),
  data: z.object({ aiEmbeddingId: z.string().min(1) }),
})

const aiJobSummarizeConversationSchema = z.object({
  type: z.literal(AIJobAction.summarizeConversation),
  data: aiJobSummarizeConversationDataSchema,
})

const aiJobProcessConversationSourceSchema = z.object({
  type: z.literal(AIJobAction.processConversationSource),
  data: z.object({ sourceId: z.string().min(1) }),
})

const aiJobProcessConversationSourceEmbeddingSchema = z.object({
  type: z.literal(AIJobAction.processConversationSourceEmbedding),
  data: z.object({ conversationEmbeddingId: z.string().min(1) }),
})

const aiJobProcessAutomatedResponseSchema = z.object({
  type: z.literal(AIJobAction.processAutomatedResponse),
  data: z.object({
    conversationId: z.string().min(1),
    contactInboxId: z.string().min(1),
    messageId: z.string().min(1),
  }),
})

const aiJobProcessHandoffReentrySchema = z.object({
  type: z.literal(AIJobAction.processHandoffReentry),
  data: z.object({
    conversationId: z.string().min(1),
    contactInboxId: z.string().min(1),
    messageId: z.string().min(1),
  }),
})

const aiJobCommentAIReplySchema = z.object({
  type: z.literal(AIJobAction.commentAIReply),
  data: z.object({
    automationId: z.string().min(1),
    integrationType: z.string().min(1),
    integrationIdentifier: z.string().min(1),
    workspaceId: z.string().min(1),
    conversationId: z.string().min(1),
    contactInboxId: z.string().min(1),
    commentId: z.string().min(1),
    agentId: z.string().min(1),
    replyChannel: z.enum(["public", "private"]),
    channelType: z.enum([
      "messenger",
      "instagram",
      "instagramFacebook",
      "threads",
      "tiktok",
    ]),
    message: z.string().optional(),
    parentMessageId: z.string().nullable().optional(),
    parentMessageCreatedAt: z.string().nullable().optional(),
    // Dedup row written by `processCommentAutomation` when it enqueued this
    // job. Carried so a job that bails out without delivering anything can roll
    // it back instead of leaving the contact blocked forever by
    // `replyOncePerUserPerPost`. Built once at dispatch, never recomposed here.
    commentDedup: z
      .object({
        automationId: z.string().min(1),
        contactId: z.string().min(1),
        postId: z.string().min(1),
        workspaceId: z.string().min(1),
      })
      .optional(),
  }),
})

/**
 * AI moderation of one comment for one automation. `commentAutomation` is the
 * original `processCommentAutomation` payload: a comment the AI clears is
 * re-run through that job for `automationId` only, with `moderationChecked`.
 */
const aiJobCommentModerationSchema = z.object({
  type: z.literal(AIJobAction.commentModeration),
  data: z.object({
    automationId: z.string().min(1),
    workspaceId: z.string().min(1),
    commentId: z.string().min(1),
    messageId: z.string().min(1),
    messageCreatedAt: z.string().min(1),
    commentAutomation: z.custom<IntegrationJobProcessCommentAutomation["data"]>(
      (value) => typeof value === "object" && value !== null,
    ),
  }),
})

const aiJobProcessStoryReplyAutomationSchema = z.object({
  type: z.literal(AIJobAction.processStoryReplyAutomation),
  data: z.object({
    workspaceId: z.string().min(1),
    conversationId: z.string().min(1),
    contactInboxId: z.string().min(1),
    messageId: z.string().min(1),
    storyId: z.string().min(1),
    storyUrl: z.string().optional(),
    message: z.string().optional(),
    channelType: z.enum(["instagram", "instagramFacebook"]),
  }),
})

const aiJobProcessStoryMentionAutomationSchema = z.object({
  type: z.literal(AIJobAction.processStoryMentionAutomation),
  data: z.object({
    workspaceId: z.string().min(1),
    conversationId: z.string().min(1),
    contactInboxId: z.string().min(1),
    messageId: z.string().min(1),
    channelType: z.enum(["instagram", "instagramFacebook"]),
  }),
})

/**
 * Translate inbound messages a member opened (or an AI agent requested).
 * `messages` carry `createdAt` because `Message` is sharded by it. `requestId`
 * is the value of the in-flight Redis markers the request claimed; the handler
 * only works on messages whose marker is still its own.
 */
const aiJobTranslateMessagesSchema = z.object({
  type: z.literal(AIJobAction.translateMessages),
  data: z.object({
    workspaceId: z.string().min(1),
    conversationId: z.string().min(1),
    messages: z
      .array(z.object({ id: z.string().min(1), createdAt: z.coerce.date() }))
      .min(1)
      .max(TRANSLATION_JOB_MAX_MESSAGES),
    retryFailed: z.boolean(),
    requestId: z.string().min(1),
  }),
})

export const aiJobDataSchema = z.discriminatedUnion("type", [
  aiJobProcessFileSchema,
  aiJobProcessPendingEmbeddingSchema,
  aiJobSummarizeConversationSchema,
  aiJobProcessConversationSourceSchema,
  aiJobProcessConversationSourceEmbeddingSchema,
  aiJobProcessAutomatedResponseSchema,
  aiJobProcessHandoffReentrySchema,
  aiJobCommentAIReplySchema,
  aiJobCommentModerationSchema,
  aiJobProcessStoryReplyAutomationSchema,
  aiJobProcessStoryMentionAutomationSchema,
  aiJobTranslateMessagesSchema,
])

export type AIJobData = z.infer<typeof aiJobDataSchema>
export type AIJobProcessFile = z.infer<typeof aiJobProcessFileSchema>
export type AIJobProcessPendingEmbedding = z.infer<
  typeof aiJobProcessPendingEmbeddingSchema
>
export type AIJobSummarizeConversation = z.infer<
  typeof aiJobSummarizeConversationSchema
>
export type AIJobProcessConversationSource = z.infer<
  typeof aiJobProcessConversationSourceSchema
>
export type AIJobProcessConversationSourceEmbedding = z.infer<
  typeof aiJobProcessConversationSourceEmbeddingSchema
>
export type AIJobProcessAutomatedResponse = z.infer<
  typeof aiJobProcessAutomatedResponseSchema
>
export type AIJobProcessHandoffReentry = z.infer<
  typeof aiJobProcessHandoffReentrySchema
>
export type AIJobCommentAIReply = z.infer<typeof aiJobCommentAIReplySchema>
export type AIJobCommentModeration = z.infer<
  typeof aiJobCommentModerationSchema
>
export type AIJobProcessStoryReplyAutomation = z.infer<
  typeof aiJobProcessStoryReplyAutomationSchema
>
export type AIJobProcessStoryMentionAutomation = z.infer<
  typeof aiJobProcessStoryMentionAutomationSchema
>

export type AIJobTranslateMessages = z.infer<
  typeof aiJobTranslateMessagesSchema
>

/** A short, dependency-free fingerprint (this package also loads in the builder, so no `node:crypto`). Only for readable ids, not security. */
const FINGERPRINT_MODULUS = 4_294_967_291
const fingerprint = (value: string): string => {
  let hash = 7
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) % FINGERPRINT_MODULUS
  }
  return hash.toString(16)
}

/**
 * Always unique per call (`now` in the id), never deterministic: the worker
 * keeps finished and failed jobs, and BullMQ drops an `add` whose id already
 * exists, which would swallow a legitimate re-request (the customer edited the
 * message, the agent pressed "Retry"). De-duplication is the per-message Redis
 * marker plus the unique `(workspaceId, messageId)` row, not the job id. No
 * `:` in it (BullMQ forbids it in custom ids).
 */
export const buildTranslateMessagesJobId = (props: {
  conversationId: string
  messageIds: string[]
  now?: number
}): string =>
  `translate-${props.conversationId}-${fingerprint([...props.messageIds].sort().join(","))}-${props.now ?? Date.now()}`

/**
 * Per-job options for {@link AIJobAction.translateMessages}. The queue default
 * is 2 attempts at 5 s, so these are passed explicitly: 3 attempts with a 2 s
 * exponential back-off, behind AI replies (`TRANSLATION_JOB_PRIORITY`).
 */
export const getTranslateMessagesJobOptions = (jobId: string) => ({
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  priority: TRANSLATION_JOB_PRIORITY,
  jobId,
})

export const aiAgentQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<AIJobData>(queueNames.enum.aiAgent, {
      connection: getQueueConnection(queueNames.enum.aiAgent),
      defaultJobOptions,
    })
