import { db, sql } from "@chatbotx.io/database/client"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"

const BOOTSTRAP_WINDOW_HOURS = 24
const BOOTSTRAP_INTERVAL_MS_DEFAULT = 3_600_000
const CLEANUP_INTERVAL_MS_DEFAULT = 21_600_000
const RETENTION_BATCH_SIZE_DEFAULT = 1000
const RETENTION_INTERVAL_MS_DEFAULT = 86_400_000
const RETENTION_TTL_DAYS_DEFAULT = 30
const BATCH_SIZE = 1000
const TOTAL_BUCKETS = 256

interface ReconcileJobOptions {
  cleanupIntervalMs: number
  intervalMs: number
  retentionBatchSize: number
  retentionIntervalMs: number
  retentionTtlDays: number
}

export class ReconcileJob {
  private running = false
  private intervalId: NodeJS.Timeout | null = null
  private cleanupIntervalId: NodeJS.Timeout | null = null
  private retentionIntervalId: NodeJS.Timeout | null = null
  private lastReconcileRun: Date | null = null
  private lastCleanupRun: Date | null = null
  private lastRetentionRun: Date | null = null
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
      retentionBatchSize:
        options.retentionBatchSize || RETENTION_BATCH_SIZE_DEFAULT,
      retentionIntervalMs:
        options.retentionIntervalMs || RETENTION_INTERVAL_MS_DEFAULT,
      retentionTtlDays: options.retentionTtlDays || RETENTION_TTL_DAYS_DEFAULT,
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

    this.retentionIntervalId = setInterval(() => {
      this.deleteTerminalDispatches().catch((err) => {
        logger.error({ err }, "Error in sequence dispatch retention job")
      })
    }, this.options.retentionIntervalMs)

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
        const dispatches = await db.query.sequenceDispatchModel.findMany({
          // status=pending intentionally prunes this scan to SequenceDispatch_pending.
          where: {
            status: "pending",
            runAtMs: { lte: String(windowEnd.getTime()) },
          },
          columns: {
            id: true,
            bucket: true,
            runAtMs: true,
            workspaceId: true,
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
      logger.error(error, "Error in reconciliation")
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

    if (this.retentionIntervalId) {
      clearInterval(this.retentionIntervalId)
      this.retentionIntervalId = null
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
      logger.error(error, "Error during orphan cleanup")
      throw error
    }
  }

  private async getZSetMembers(bucket: number, type: "schedule" | "retry") {
    try {
      return await this.scheduler.getZSetMembers(bucket, type)
    } catch (error) {
      logger.error(error, "Error getting ZSET members")
      logger.error(
        { bucket, type },
        "Error getting ZSET members bucket and type",
      )
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

  async deleteTerminalDispatches() {
    const retentionTtlDays = Math.max(1, this.options.retentionTtlDays)
    const batchSize = Math.max(1, this.options.retentionBatchSize)
    let deletedCount = 0

    while (true) {
      const result = await db.execute<{ id: string }>(sql`
        WITH rows AS (
          SELECT "id", "workspaceId"
          FROM "SequenceDispatch"
          WHERE "status" IN ('completed', 'failed', 'canceled')
            AND "updatedAt" < NOW() - (${retentionTtlDays} * INTERVAL '1 day')
          LIMIT ${batchSize}
        )
        DELETE FROM "SequenceDispatch" sd
        USING rows
        WHERE sd."id" = rows."id"
          AND sd."workspaceId" = rows."workspaceId"
        RETURNING sd."id"
      `)
      const rowCount = result.rows.length
      deletedCount += rowCount

      if (rowCount < batchSize) {
        break
      }
    }

    this.lastRetentionRun = new Date()
    return deletedCount
  }

  getHealth(): {
    running: boolean
    lastReconcileRun: Date | null
    lastCleanupRun: Date | null
    lastRetentionRun: Date | null
    reconcileIntervalMs: number
    cleanupIntervalMs: number
    retentionIntervalMs: number
  } {
    return {
      running: this.running,
      lastReconcileRun: this.lastReconcileRun,
      lastCleanupRun: this.lastCleanupRun,
      lastRetentionRun: this.lastRetentionRun,
      reconcileIntervalMs: this.options.intervalMs,
      cleanupIntervalMs: this.options.cleanupIntervalMs,
      retentionIntervalMs: this.options.retentionIntervalMs,
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

const retentionIntervalMs = Number.parseInt(
  process.env.SEQUENCE_DISPATCH_RETENTION_INTERVAL_MS ||
    RETENTION_INTERVAL_MS_DEFAULT.toString(),
  10,
)

const retentionTtlDays = Number.parseInt(
  process.env.SEQUENCE_DISPATCH_RETENTION_TTL_DAYS ||
    RETENTION_TTL_DAYS_DEFAULT.toString(),
  10,
)

const retentionBatchSize = Number.parseInt(
  process.env.SEQUENCE_DISPATCH_RETENTION_BATCH_SIZE ||
    RETENTION_BATCH_SIZE_DEFAULT.toString(),
  10,
)

const reconcile = new ReconcileJob({
  intervalMs,
  cleanupIntervalMs,
  retentionIntervalMs,
  retentionTtlDays,
  retentionBatchSize,
})
const shouldAutoStart = process.env.NODE_ENV !== "test" && !process.env.VITEST

let isShuttingDown = false

async function startReconcileWorker() {
  await ensureBootstrapped()
  await reconcile.start()
}

function stopReconcileWorker() {
  try {
    reconcile.stop()
  } catch (error) {
    logger.error(error, "Error stopping reconcile worker")
  }
}

if (shouldAutoStart) {
  startReconcileWorker().catch((error) => {
    logger.error(error, "Error starting reconcile worker")
    process.exitCode = 1
  })
}

const handleShutdownSignal = (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  logger.info({ signal }, "Shutdown signal received")

  try {
    stopReconcileWorker()
    process.exit(0)
  } catch (error) {
    logger.error(error, "Error during reconcile worker shutdown")
    process.exit(1)
  }
}

if (shouldAutoStart) {
  process.on("SIGINT", () => {
    handleShutdownSignal("SIGINT")
  })

  process.on("SIGTERM", () => {
    handleShutdownSignal("SIGTERM")
  })
}
