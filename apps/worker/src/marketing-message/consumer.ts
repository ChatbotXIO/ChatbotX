import {
  defaultWorkerOptions,
  getQueueConnection,
  MarketingMessageJobAction,
  type MarketingMessageJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { logger } from "../lib/logger"
import { processMarketingMessageCampaign } from "../schedule/handlers/process-marketing-message-campaign"

/**
 * Consumer for the dedicated `marketingMessage` queue. Each job is one
 * campaign step; the blocked-owner guard runs inside the step handler.
 */
export function startMarketingMessageWorker(): Worker<MarketingMessageJobData> {
  const worker = new Worker<MarketingMessageJobData>(
    queueNames.enum.marketingMessage,
    async (job: Job<MarketingMessageJobData>) => {
      switch (job.data.type) {
        case MarketingMessageJobAction.processCampaign:
          await processMarketingMessageCampaign(job.data.data)
          return
        default:
          return
      }
    },
    {
      connection: getQueueConnection(queueNames.enum.marketingMessage),
      ...defaultWorkerOptions,
      concurrency: env.MARKETING_MESSAGE_WORKER_CONCURRENCY,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err, jobId: job.id }, "Marketing message job failed")
    }
  })

  return worker
}
