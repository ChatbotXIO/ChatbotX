import { SdkException } from "@aha.chat/sdk"
import {
  AnalyticsJobData,
  analyticsQueue,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@aha.chat/worker-config"
import { type Job, Queue, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { ingestEvents } from "./handlers/ingest-events"
import { registerSchedules } from "./handlers/register-schedules"
import { syncEvents } from "./handlers/sync-events"

async function startScheduleWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Analytics bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap analytics")
    process.exit(1)
  }

  if (analyticsQueue instanceof Queue) {
    registerSchedules()
      .then(() => {
        logger.info("Schedules registered")
      })
      .catch((err) => {
        logger.error(err, "Error registering schedules")
      })
  }

  const worker = new Worker(
    queueName.analytics,
    async (job: Job<AnalyticsJobData>) => {
      switch (job.data.type) {
        case AnalyticsJobData.syncContact:
        case AnalyticsJobData.syncConversation:
        case AnalyticsJobData.syncBotMessage:
          await syncEvents(job.data)
          return
        case AnalyticsJobData.ingestContactEvents:
        case AnalyticsJobData.ingestBotMessageEvents:
        case AnalyticsJobData.ingestConversationEvents:
          await ingestEvents(job.data)
          return
        default:
          throw new SdkException("AnalyticsJobData type is not defined")
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(err, `${job.id} has failed`)
    }
  })
}

startScheduleWorker().catch((err) => {
  logger.error(err, "Failed to start schedule worker")
  process.exit(1)
})
