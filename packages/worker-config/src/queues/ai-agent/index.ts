import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const aiAgentQueue = new Queue(QueueName.AI_AGENT, {
  connection: getRedisConnection(),
  defaultJobOptions,
})

export const AI_FILES_DEFAULT_CHUNK_SIZE = 1000
export const AI_FILES_DEFAULT_OVERLAP_SIZE = 200

export const AIFilesJobAction = {
  PROCESS_AI_FILE: "PROCESS_AI_FILE",
  PROCESS_CHUNK: "PROCESS_CHUNK",
  PROCESS_PENDING_EMBEDDINGS: "PROCESS_PENDING_EMBEDDINGS",
} as const

export type ProcessAiFileData = {
  chatbotId: string
  aiFileId: string
  filePath: string
  mimeType: string
  chunkSize?: number
  overlapSize?: number
}

export type ProcessChunkData = {
  chatbotId: string
  aiFileId: string
  content: string
  index: number
}

export type ProcessPendingEmbeddingsData = {
  chatbotId: string
  limit?: number
}

export type AiFilesJobProcessAiFile = {
  type: typeof AIFilesJobAction.PROCESS_AI_FILE
  data: ProcessAiFileData
}

export type AiFilesJobProcessChunk = {
  type: typeof AIFilesJobAction.PROCESS_CHUNK
  data: ProcessChunkData
}

export type AiFilesJobProcessPendingEmbeddings = {
  type: typeof AIFilesJobAction.PROCESS_PENDING_EMBEDDINGS
  data: ProcessPendingEmbeddingsData
}

export type AiFilesJobData =
  | AiFilesJobProcessAiFile
  | AiFilesJobProcessChunk
  | AiFilesJobProcessPendingEmbeddings

export const aiFilesQueue = new Queue<AiFilesJobData>(QueueName.AI_AGENT, {
  connection: getRedisConnection(),
  defaultJobOptions,
})

export function enqueueProcessAiFileJob({
  chatbotId,
  aiFileId,
  filePath,
  mimeType,
  chunkSize = AI_FILES_DEFAULT_CHUNK_SIZE,
  overlapSize = AI_FILES_DEFAULT_OVERLAP_SIZE,
}: ProcessAiFileData) {
  return aiFilesQueue.add(AIFilesJobAction.PROCESS_AI_FILE, {
    type: AIFilesJobAction.PROCESS_AI_FILE,
    data: {
      chatbotId,
      aiFileId,
      filePath,
      mimeType,
      chunkSize,
      overlapSize,
    },
  })
}

export function enqueueProcessPendingEmbeddingsJob(
  data: ProcessPendingEmbeddingsData,
) {
  return aiFilesQueue.add(AIFilesJobAction.PROCESS_PENDING_EMBEDDINGS, {
    type: AIFilesJobAction.PROCESS_PENDING_EMBEDDINGS,
    data,
  })
}
