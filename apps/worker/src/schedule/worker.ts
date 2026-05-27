import {
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
  ScheduleJobData,
  scheduleQueue,
} from "@chatbotx.io/worker-config"
import { type Job, Queue, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import {
  cleanupTriggerExecutions,
  scanDateTimeTriggers,
} from "../trigger/datetime-trigger-scanner"
import { enqueueBroadcast } from "./handlers/enqueue-broadcast"
import { finalizeBroadcasts } from "./handlers/finalize-broadcasts"
import { prepareBroadcast } from "./handlers/prepare-broadcast"
import { processBroadcastContacts } from "./handlers/process-broadcast-contacts"
import { registerSchedules } from "./handlers/register-schedules"
import { scanSmartDelay } from "./handlers/scan-smart-delay"
import { syncUserQuota } from "./handlers/sync-user-quota"

async function startScheduleWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Analytics bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap analytics")
    process.exit(1)
  }

  if (scheduleQueue instanceof Queue) {
    registerSchedules()
      .then(() => {
        logger.info("Schedules registered")
      })
      .catch((err) => {
        logger.error(err, "Error registering schedules")
      })
  }

  const worker = new Worker(
    queueNames.enum.schedule,
    async (job: Job<ScheduleJobData>) => {
      switch (job.data.type) {
        case ScheduleJobData.enqueueBroadcast:
          await enqueueBroadcast()
          return

        case ScheduleJobData.prepareBroadcast:
          await prepareBroadcast(job.data.data.broadcastId)
          return

        case ScheduleJobData.sendBroadcast:
          await processBroadcastContacts()
          return

        case ScheduleJobData.finalizeBroadcasts:
          await finalizeBroadcasts()
          return

        case ScheduleJobData.evaluateTriggers:
          await scanDateTimeTriggers()
          return

        case ScheduleJobData.cleanupTriggers:
          await cleanupTriggerExecutions()
          return

        case ScheduleJobData.scanSmartDelay:
          await scanSmartDelay()
          return

        case ScheduleJobData.syncUserQuota:
          await syncUserQuota()
          return

        default:
          logger.warn("Unknown schedule job type")
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
}

startScheduleWorker().catch((err) => {
  logger.error("Failed to start schedule worker", err)
  process.exit(1)
})
