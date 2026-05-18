import { Queue } from "bullmq"
import { z } from "zod"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

export const aiAgentQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue(queueNames.enum.aiAgent, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })

export const AI_FILES_DEFAULT_CHUNK_SIZE = 1000
export const AI_FILES_DEFAULT_OVERLAP_SIZE = 200

export const AIJobAction = {
  processAIFile: "processAIFile",
  processPendingEmbedding: "processPendingEmbedding",
  summarizeConversation: "summarizeConversation",
  processConversationSource: "processConversationSource",
  processConversationSourceEmbedding: "processConversationSourceEmbedding",
} as const

export type AIJobProcessFile = {
  type: typeof AIJobAction.processAIFile
  data: {
    aiFileId: string
  }
}

export type AIJobProcessPendingEmbedding = {
  type: typeof AIJobAction.processPendingEmbedding
  data: {
    aiEmbeddingId: string
  }
}

export type AIJobSummarizeConversation = {
  type: typeof AIJobAction.summarizeConversation
  data: {
    conversationId: string
  }
}

export const aiJobSummarizeConversationDataSchema = z.object({
  conversationId: z.string().min(1),
})

export type AIJobProcessConversationSource = {
  type: typeof AIJobAction.processConversationSource
  data: {
    sourceId: string
  }
}

export type AIJobProcessConversationSourceEmbedding = {
  type: typeof AIJobAction.processConversationSourceEmbedding
  data: {
    conversationEmbeddingId: string
  }
}

export type AIJobData =
  | AIJobProcessFile
  | AIJobProcessPendingEmbedding
  | AIJobSummarizeConversation
  | AIJobProcessConversationSource
  | AIJobProcessConversationSourceEmbedding
