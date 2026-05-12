import { defineQueue } from "../../lib/define-queue"

export const AI_FILES_DEFAULT_CHUNK_SIZE = 1000
export const AI_FILES_DEFAULT_OVERLAP_SIZE = 200

export const AIJobAction = {
  processAIFile: "processAIFile",
  processPendingEmbedding: "processPendingEmbedding",
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

export type AIJobData = AIJobProcessFile | AIJobProcessPendingEmbedding

export const aiAgentQueue = defineQueue<AIJobData>("aiAgent")
