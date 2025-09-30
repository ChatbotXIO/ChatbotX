import { Queue } from "bullmq"
import { defaultJobOptions, getRedisConnection } from "../../lib/connection"
import { QueueName } from "../../lib/types"

export const AI_FILES_DEFAULT_CHUNK_SIZE = 1000
export const AI_FILES_DEFAULT_OVERLAP_SIZE = 200

export const AiFilesJobAction = {
  PROCESS_AI_FILE: "PROCESS_AI_FILE",
  PROCESS_CHUNK: "PROCESS_CHUNK",
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

export type AiFilesJobData =
  | { type: (typeof AiFilesJobAction)["PROCESS_AI_FILE"]; data: ProcessAiFileData }
  | { type: (typeof AiFilesJobAction)["PROCESS_CHUNK"]; data: ProcessChunkData }

export const aiFilesQueue = new Queue<AiFilesJobData>(QueueName.AI_FILES, {
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
  return aiFilesQueue.add(AiFilesJobAction.PROCESS_AI_FILE, {
    type: AiFilesJobAction.PROCESS_AI_FILE,
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


