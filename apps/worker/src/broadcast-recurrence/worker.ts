import {
  BroadcastRecurrenceJobAction,
  type BroadcastRecurrenceJobData,
  defaultWorkerOptions,
  getQueueConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { env } from "../env"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { materializeRecurringBroadcasts } from "./handlers/materialize-recurring-broadcasts"

/**
 * Consumer of the dedicated `broadcastRecurrence` queue. Runs as its own
 * process (`worker broadcast-recurrence`) so a burst of due series scales —
 * and fails — independently of the shared `schedule` worker, whose few slots
 * belong to the crons. Concurrency is `BROADCAST_RECURRENCE_WORKER_CONCURRENCY`.
 */
async function startBroadcastRecurrenceWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap broadcast recurrence worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.broadcastRecurrence,
    async (job: Job<BroadcastRecurrenceJobData>) => {
      switch (job.data.type) {
        case BroadcastRecurrenceJobAction.materializeRecurringBroadcasts:
          await materializeRecurringBroadcasts(job.data.data.items)
          return
        default: {
          // Exhaustiveness guard — a new job variant without a case here
          // becomes a compile error.
          const _exhaustive: never = job.data.type
          logger.warn({ type: _exhaustive }, "Unknown broadcast recurrence job")
        }
      }
    },
    {
      connection: getQueueConnection(queueNames.enum.broadcastRecurrence),
      ...defaultWorkerOptions,
      concurrency: env.BROADCAST_RECURRENCE_WORKER_CONCURRENCY,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Broadcast recurrence job ${job.id} has failed`)
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
      logger.error(err, "[BroadcastRecurrenceWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startBroadcastRecurrenceWorker().catch((err) => {
  logger.error({ err }, "Failed to start broadcast recurrence worker")
  process.exit(1)
})
