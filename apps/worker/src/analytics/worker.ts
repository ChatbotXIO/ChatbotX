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
import { ingestBotMessageEvents } from "./handlers/ingest-bot-message"
import { ingestContactEvents } from "./handlers/ingest-contact"
import { registerSchedules } from "./handlers/register-schedules"
import { syncBotMessage } from "./handlers/sync-bot-message"
import { syncContact } from "./handlers/sync-contact"

async function startScheduleWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Analytics bootstrapped successfully")
  } catch (err) {
    logger.error("Failed to bootstrap analytics", err)
    process.exit(1)
  }

  if (analyticsQueue instanceof Queue) {
    registerSchedules()
      .then(() => {
        logger.info("Schedules registered")
      })
      .catch((err) => {
        logger.error("Error registering schedules", err)
      })
  }

  const worker = new Worker(
    queueName.analytics,
    async (job: Job<AnalyticsJobData>) => {
      console.log(job.data)

      switch (job.data.type) {
        case AnalyticsJobData.syncContact:
          await syncContact(job.data)
          return
        case AnalyticsJobData.syncConversation:
          // TODO: implement sync analytics
          return
        case AnalyticsJobData.syncBotMessage:
          await syncBotMessage(job.data)
          return
        case AnalyticsJobData.ingestContactEvents:
          await ingestContactEvents(job.data)
          return
        case AnalyticsJobData.ingestBotMessageEvents:
          await ingestBotMessageEvents(job.data)
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
      logger.error(`${job.id} has failed`, err)
    }
  })
}

startScheduleWorker().catch((err) => {
  logger.error("Failed to start schedule worker", err)
  process.exit(1)
})
