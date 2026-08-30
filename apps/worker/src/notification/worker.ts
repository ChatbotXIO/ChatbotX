import { withBlockedOwnerGuard } from "@chatbotx.io/business"
import {
  defaultWorkerOptions,
  getRedisConnection,
  type NotificationJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { sendPushForNotificationJob } from "./handlers/send-push"

async function startNotificationWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Notification worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap notification worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.notification,
    async (job: Job<NotificationJobData>) => {
      await withBlockedOwnerGuard(job.data.data.workspaceId, async () => {
        await sendPushForNotificationJob(job.data)
      })
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      concurrency: env.NOTIFICATION_WORKER_CONCURRENCY,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(err, `Notification job ${job.id} has failed`)
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
      logger.error(err, "[NotificationWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startNotificationWorker()
