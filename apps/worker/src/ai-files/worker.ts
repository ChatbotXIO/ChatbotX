import {
  AiFilesJobAction,
  type AiFilesJobData,
  defaultWorkerOptions,
  getRedisConnection,
  QueueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { processAiFile } from "./handlers/process-ai-file"
import { processChunk } from "./handlers/process-chunk"
import { processPendingEmbeddings } from "./handlers/process-pending-embeddings"

const worker = new Worker(
  QueueName.AI_FILES,
  async (job: Job<AiFilesJobData>) => {
    switch (job.data.type) {
      case AiFilesJobAction.PROCESS_AI_FILE:
        await processAiFile(job.data.data)
        return
      case AiFilesJobAction.PROCESS_CHUNK:
        await processChunk(job.data.data)
        return
      case AiFilesJobAction.PROCESS_PENDING_EMBEDDINGS:
        await processPendingEmbeddings(job.data.data)
        return
      default:
        return
    }
  },
  {
    connection: getRedisConnection(),
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
