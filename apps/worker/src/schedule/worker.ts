import {
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
  ScheduleJobData,
  scheduleQueue,
} from "@aha.chat/worker-config"
import { type Job, Queue, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import {
  cleanupTriggerExecutions,
  scanDateTimeTriggers,
} from "../trigger/datetime-trigger-scanner"
import { registerSchedules } from "./handlers/register-schedules"
import { sendBroadcast } from "./handlers/send-broadcast"

async function runScheduleJob<T>(
  job: Job<ScheduleJobData>,
  execute: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()

  try {
    const result = await execute()
    const durationMs = Date.now() - startedAt
    logger.info(
      `[schedule] type=${job.data.type} jobId=${job.id} durationMs=${durationMs}`,
    )
    return result
  } catch (error) {
    const durationMs = Date.now() - startedAt
    logger.error(
      error,
      `[schedule] failed type=${job.data.type} jobId=${job.id} durationMs=${durationMs}`,
    )
    throw error
  }
}

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
        logger.error("Error registering schedules", err)
      })
  }

  const worker = new Worker(
    queueName.schedule,
    async (job: Job<ScheduleJobData>) => {
      switch (job.data.type) {
        case ScheduleJobData.sendBroadcast:
          await runScheduleJob(job, async () => {
            await sendBroadcast(new Date(job.timestamp))
          })
          return

        case ScheduleJobData.evaluateTriggers:
          await runScheduleJob(job, scanDateTimeTriggers)
          return

        case ScheduleJobData.cleanupTriggers:
          await runScheduleJob(job, cleanupTriggerExecutions)
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
