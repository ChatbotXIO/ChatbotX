import {
  BroadcastJobAction,
  type BroadcastJobData,
  broadcastQueue,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@chatbotx.io/worker-config"
import { type Job, Queue, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { processBroadcastContacts } from "./handlers/process-broadcast-contacts"
import { registerBroadcastSchedules } from "./handlers/register-schedules"

async function startBroadcastWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Broadcast worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap broadcast worker")
    process.exit(1)
  }

  if (broadcastQueue instanceof Queue) {
    registerBroadcastSchedules()
      .then(() => {
        logger.info("Broadcast schedules registered")
      })
      .catch((err) => {
        logger.error(err, "Error registering broadcast schedules")
      })
  }

  const worker = new Worker(
    queueName.broadcast,
    async (job: Job<BroadcastJobData>) => {
      switch (job.data.type) {
        case BroadcastJobAction.processBroadcastContacts:
          await processBroadcastContacts()
          return

        default:
          logger.warn("Unknown broadcast job type")
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

startBroadcastWorker().catch((err) => {
  logger.error("Failed to start broadcast worker", err)
  process.exit(1)
})
