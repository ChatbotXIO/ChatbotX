import {
  AIJobAction,
  type AIJobData,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { aiLogger, logger } from "../lib/logger"
import { processAIFile } from "./handlers/process-ai-file"
import { processPendingEmbedding } from "./handlers/process-pending-embeddings"

const worker = new Worker(
  queueName.aiAgent,
  async (job: Job<AIJobData>) => {
    aiLogger.info("Worker received job", {
      id: job.id,
      name: job.name,
      type: job.data.type,
    })

    switch (job.data.type) {
      case AIJobAction.processAIFile:
        await processAIFile(job.data.data)
        return
      case AIJobAction.processPendingEmbedding:
        await processPendingEmbedding(job.data.data)
        return
      default:
        aiLogger.warn("Unknown job type", {
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
