import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
  WebhookJobAction,
  type WebhookJobData,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { logger } from "../lib/logger"
import { WebhookMatcherService } from "./services/webhook-matcher.service"

const webhookMatcher = new WebhookMatcherService()

const worker = new Worker(
  queueNames.enum.webhook,
  async (job: Job<WebhookJobData>) => {
    if (
      (await withBlockedOwnerGuard(
        job.data.data.workspaceId,
        async () => true,
      )) === undefined
    ) {
      return
    }

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
    concurrency: env.WEBHOOK_WORKER_CONCURRENCY,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(err, `Webhook job ${job.id} has failed`)
  }
})

let isShuttingDown = false
async function shutdown() {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true
  try {
    await worker.close()
    process.exit(0)
  } catch (err) {
    logger.error(err, "[WebhookWorker] Error during shutdown")
    process.exit(1)
  }
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
