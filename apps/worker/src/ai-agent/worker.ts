import {
  AIFilesJobAction,
  type AiFilesJobData,
  defaultWorkerOptions,
  getRedisConnection,
  QueueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { processAiFile } from "../ai-files/handlers/process-ai-file"
import { processChunk } from "../ai-files/handlers/process-chunk"
import { processPendingEmbeddings } from "../ai-files/handlers/process-pending-embeddings"
import { logger } from "../lib/logger"

const worker = new Worker(
  QueueName.AI_AGENT,
  async (job: Job<AiFilesJobData>) => {
    logger.info("[ai-files] Worker received job", {
      id: job.id,
      name: job.name,
      type: job.data.type,
    })
    switch (job.data.type) {
      case AIFilesJobAction.PROCESS_AI_FILE:
        await processAiFile(job.data.data)
        return
      case AIFilesJobAction.PROCESS_CHUNK:
        await processChunk(job.data.data)
        return
      case AIFilesJobAction.PROCESS_PENDING_EMBEDDINGS:
        await processPendingEmbeddings(job.data.data)
        return
      default:
        logger.warn("[ai-files] Unknown job type", {
          type: (job.data as { type?: string }).type,
        })
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
