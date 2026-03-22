import {
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
  WebhookJobAction,
  type WebhookJobData,
} from "@aha.chat/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/logger"
import { WebhookMatcherService } from "./services/webhook-matcher.service"

const webhookMatcher = new WebhookMatcherService()

const worker = new Worker(
  queueName.webhook,
  async (job: Job<WebhookJobData>) => {
    switch (job.data.type) {
      case WebhookJobAction.evaluateWebhooks: {
        await webhookMatcher.findAndExecuteWebhooks(job.data.data)
        return
      }
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
    logger.error(`Webhook job ${job.id} has failed`, err)
  }
})
