import {
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
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
import { registerSchedules } from "./handlers/register-schedules"
import { sendBroadcast } from "./handlers/send-broadcast"

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
    queueName.schedule,
    async (job: Job<ScheduleJobData>) => {
      switch (job.data.type) {
        case ScheduleJobData.sendBroadcast:
          await sendBroadcast()
          return

        case ScheduleJobData.evaluateTriggers:
          await scanDateTimeTriggers()
          return

        case ScheduleJobData.cleanupTriggers:
          await cleanupTriggerExecutions()
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
