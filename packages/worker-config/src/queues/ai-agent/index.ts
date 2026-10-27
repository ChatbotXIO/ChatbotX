import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

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

export const AIJobAction = {
  processAIFile: "processAIFile",
  processPendingEmbedding: "processPendingEmbedding",
  summarizeConversation: "summarizeConversation",
  processConversationSource: "processConversationSource",
  processConversationSourceEmbedding: "processConversationSourceEmbedding",
  processAutomatedResponse: "processAutomatedResponse",
  processHandoffReentry: "processHandoffReentry",
  commentAIReply: "commentAIReply",
  processStoryReplyAutomation: "processStoryReplyAutomation",
  processStoryMentionAutomation: "processStoryMentionAutomation",
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

export const aiJobDataSchema = z.discriminatedUnion("type", [
  aiJobProcessFileSchema,
  aiJobProcessPendingEmbeddingSchema,
  aiJobSummarizeConversationSchema,
  aiJobProcessConversationSourceSchema,
  aiJobProcessConversationSourceEmbeddingSchema,
  aiJobProcessAutomatedResponseSchema,
  aiJobProcessHandoffReentrySchema,
  aiJobCommentAIReplySchema,
  aiJobProcessStoryReplyAutomationSchema,
  aiJobProcessStoryMentionAutomationSchema,
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
export type AIJobProcessStoryReplyAutomation = z.infer<
  typeof aiJobProcessStoryReplyAutomationSchema
>
export type AIJobProcessStoryMentionAutomation = z.infer<
  typeof aiJobProcessStoryMentionAutomationSchema
>

export const aiAgentQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<AIJobData>(queueNames.enum.aiAgent, {
      connection: getQueueConnection(queueNames.enum.aiAgent),
      defaultJobOptions,
    })
