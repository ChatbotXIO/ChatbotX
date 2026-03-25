import { db } from "@aha.chat/database/client"
import { SchedulerClient } from "@aha.chat/scheduler"
import { sequenceConnections } from "@chatbotx.io/redis"
import { logger } from "../lib/logger"

const BOOTSTRAP_WINDOW_HOURS = 24
const BOOTSTRAP_INTERVAL_MS_DEFAULT = 3_600_000
const CLEANUP_INTERVAL_MS_DEFAULT = 21_600_000
const BATCH_SIZE = 1000
const TOTAL_BUCKETS = 256

interface ReconcileJobOptions {
  cleanupIntervalMs: number
  intervalMs: number
}

class ReconcileJob {
  private running = false
  private intervalId: NodeJS.Timeout | null = null
  private cleanupIntervalId: NodeJS.Timeout | null = null
  private lastReconcileRun: Date | null = null
  private lastCleanupRun: Date | null = null
  private _scheduler: SchedulerClient | null = null
  private readonly options: ReconcileJobOptions

  private get scheduler(): SchedulerClient {
    if (!this._scheduler) {
      throw new Error("Scheduler not initialized. Call start() first.")
    }
    return this._scheduler
  }

  constructor(options: Partial<ReconcileJobOptions>) {
    this.options = {
      intervalMs: options.intervalMs || BOOTSTRAP_INTERVAL_MS_DEFAULT,
      cleanupIntervalMs:
        options.cleanupIntervalMs || CLEANUP_INTERVAL_MS_DEFAULT,
    }
  }

  async start() {
    if (this.running) {
      return
    }

    const redisClient = await sequenceConnections.useExisting()
    this._scheduler = new SchedulerClient(redisClient)

    await this.reconcile()

    this.intervalId = setInterval(() => {
      this.reconcile().catch((error) => {
        logger.error(error, "Error in reconcile job")
      })
    }, this.options.intervalMs)

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOrphans().catch((error) => {
        logger.error(error, "Error in cleanup job")
      })
    }, this.options.cleanupIntervalMs)

    this.running = true
  }

  async reconcile() {
    try {
      const windowEnd = new Date(
        Date.now() + BOOTSTRAP_WINDOW_HOURS * 60 * 60 * 1000,
      )

      let hasMore = true
      let offset = 0

      while (hasMore) {
        const windowEndMs = BigInt(windowEnd.getTime())

        const dispatches = await db.query.sequenceDispatchModel.findMany({
          where: {
            status: "pending",
            runAtMs: { lte: Number(windowEndMs) },
          },
          columns: {
            id: true,
            bucket: true,
            runAtMs: true,
            chatbotId: true,
            contactId: true,
          },
          orderBy: (d, { asc }) => [asc(d.runAtMs)],
          offset,
          limit: BATCH_SIZE,
        })

        if (dispatches.length === 0) {
          hasMore = false
          break
        }

        await Promise.allSettled(
          dispatches.map((dispatch) =>
            this.scheduler.addToSchedule(
              dispatch.bucket,
              dispatch.id,
              Number(dispatch.runAtMs),
            ),
          ),
        )

        offset += BATCH_SIZE

        if (dispatches.length < BATCH_SIZE) {
          hasMore = false
          await new Promise((resolve) => setTimeout(resolve, 1000))
          break
        }
      }

      this.lastReconcileRun = new Date()
    } catch (error) {
      logger.error({ error }, "Error in reconciliation")
      throw error
    }
  }

  stop() {
    if (!this.running) {
      return
    }

    this.running = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }
  }

  async cleanupOrphans() {
    try {
      const maxBucket = this.getMaxBucket()

      for (let bucket = 0; bucket < maxBucket; bucket++) {
        const scheduleIds = await this.getZSetMembers(bucket, "schedule")
        const retryIds = await this.getZSetMembers(bucket, "retry")

        const allIds = [...new Set([...scheduleIds, ...retryIds])]

        if (allIds.length === 0) {
          continue
        }

        const validDispatches = await db.query.sequenceDispatchModel.findMany({
          where: {
            id: { in: allIds },
            status: "pending",
          },
          columns: { id: true },
        })

        const validIds = new Set(validDispatches.map((d) => d.id))
        const orphanIds = allIds.filter((id) => !validIds.has(id))

        if (orphanIds.length > 0) {
          await Promise.allSettled(
            orphanIds.map((id) => this.scheduler.removeFromAll(bucket, id)),
          )
        }
      }

      this.lastCleanupRun = new Date()
    } catch (error) {
      logger.error({ error }, "Error during orphan cleanup")
      throw error
    }
  }

  private async getZSetMembers(bucket: number, type: "schedule" | "retry") {
    try {
      return await this.scheduler.getZSetMembers(bucket, type)
    } catch (error) {
      logger.error({ error, bucket, type }, "Error getting ZSET members")
      return []
    }
  }

  private getMaxBucket(): number {
    const bucketRange = process.env.SCHEDULER_BUCKET_RANGE

    if (bucketRange) {
      if (bucketRange.includes(",")) {
        const buckets = bucketRange.split(",").map(Number)
        return Math.max(...buckets) + 1
      }

      const [, end] = bucketRange.split("-").map(Number)
      return end + 1
    }

    return TOTAL_BUCKETS
  }

  getHealth(): {
    running: boolean
    lastReconcileRun: Date | null
    lastCleanupRun: Date | null
    reconcileIntervalMs: number
    cleanupIntervalMs: number
  } {
    return {
      running: this.running,
      lastReconcileRun: this.lastReconcileRun,
      lastCleanupRun: this.lastCleanupRun,
      reconcileIntervalMs: this.options.intervalMs,
      cleanupIntervalMs: this.options.cleanupIntervalMs,
    }
  }
}

const intervalMs = Number.parseInt(
  process.env.BOOTSTRAP_INTERVAL_MS || BOOTSTRAP_INTERVAL_MS_DEFAULT.toString(),
  10,
)

const cleanupIntervalMs = Number.parseInt(
  process.env.CLEANUP_INTERVAL_MS || CLEANUP_INTERVAL_MS_DEFAULT.toString(),
  10,
)

const reconcile = new ReconcileJob({ intervalMs, cleanupIntervalMs })

let isShuttingDown = false

async function startReconcileWorker() {
  await reconcile.start()
}

function stopReconcileWorker() {
  try {
    reconcile.stop()
  } catch (error) {
    console.error("Error stopping reconcile worker:", error)
  }
}

startReconcileWorker().catch((error) => {
  console.error("Error starting reconcile worker:", error)
  process.exitCode = 1
})

const handleShutdownSignal = (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  console.log(`${signal} received, shutting down reconcile worker...`)

  try {
    stopReconcileWorker()
    process.exit(0)
  } catch (error) {
    console.error("Error during reconcile worker shutdown:", error)
    process.exit(1)
  }
}

process.on("SIGINT", () => {
  handleShutdownSignal("SIGINT")
})

process.on("SIGTERM", () => {
  handleShutdownSignal("SIGTERM")
})
