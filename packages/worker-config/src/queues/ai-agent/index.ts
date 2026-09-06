import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const AI_FILES_DEFAULT_CHUNK_SIZE = 1000
export const AI_FILES_DEFAULT_OVERLAP_SIZE = 200

export const AIJobAction = {
  processAIFile: "processAIFile",
  processPendingEmbedding: "processPendingEmbedding",
  summarizeConversation: "summarizeConversation",
  processConversationSource: "processConversationSource",
  processConversationSourceEmbedding: "processConversationSourceEmbedding",
  processAutomatedResponse: "processAutomatedResponse",
  commentAIReply: "commentAIReply",
  processStoryReplyAutomation: "processStoryReplyAutomation",
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
    channelType: z.enum(["messenger", "instagram", "instagramFacebook"]),
    message: z.string().optional(),
    parentMessageId: z.string().nullable().optional(),
    parentMessageCreatedAt: z.string().nullable().optional(),
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

export const aiJobDataSchema = z.discriminatedUnion("type", [
  aiJobProcessFileSchema,
  aiJobProcessPendingEmbeddingSchema,
  aiJobSummarizeConversationSchema,
  aiJobProcessConversationSourceSchema,
  aiJobProcessConversationSourceEmbeddingSchema,
  aiJobProcessAutomatedResponseSchema,
  aiJobCommentAIReplySchema,
  aiJobProcessStoryReplyAutomationSchema,
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
export type AIJobCommentAIReply = z.infer<typeof aiJobCommentAIReplySchema>
export type AIJobProcessStoryReplyAutomation = z.infer<
  typeof aiJobProcessStoryReplyAutomationSchema
>

export const aiAgentQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<AIJobData>(queueNames.enum.aiAgent, {
      connection: getRedisConnection(),
      defaultJobOptions,
    })
