import {
  AIJobAction,
  type AIJobData,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { processAIFile } from "./handlers/process-ai-file"
import { processPendingEmbedding } from "./handlers/process-pending-embeddings"

const worker = new Worker(
  queueName.aiAgent,
  async (job: Job<AIJobData>) => {
    logger.info(job.data, `Worker received job: ${job.id}`)

    switch (job.data.type) {
      case AIJobAction.processAIFile:
        await processAIFile(job.data.data)
        return
      case AIJobAction.processPendingEmbedding:
        await processPendingEmbedding(job.data.data)
        return
      default:
        logger.warn(`Unknown job name: ${job.name}`)
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
    logger.error(err, `Job ${job.id} has failed`)
  }
})
