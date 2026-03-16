import { db } from "@aha.chat/database/client"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { logger } from "../lib/logger"

const BOOTSTRAP_WINDOW_HOURS = 24
const BOOTSTRAP_INTERVAL_MS_DEFAULT = 3_600_000
const CLEANUP_INTERVAL_MS_DEFAULT = 21_600_000
const BATCH_SIZE = 1000
const TOTAL_BUCKETS = 256

interface BootstrapJobOptions {
  cleanupIntervalMs: number
  intervalMs: number
}

export class BootstrapJob {
  private running = false
  private intervalId: NodeJS.Timeout | null = null
  private cleanupIntervalId: NodeJS.Timeout | null = null
  private lastReconcileRun: Date | null = null
  private lastCleanupRun: Date | null = null
  private readonly dragonfly = getDragonflyClient()
  private readonly options: BootstrapJobOptions

  constructor(options: Partial<BootstrapJobOptions>) {
    this.options = {
      intervalMs: options.intervalMs || BOOTSTRAP_INTERVAL_MS_DEFAULT,
      cleanupIntervalMs:
        options.cleanupIntervalMs || CLEANUP_INTERVAL_MS_DEFAULT,
    }
  }

  async start() {
    if (this.running) {
      logger.warn("Bootstrap job already running")
      return
    }

    logger.info(
      {
        reconcileIntervalMs: this.options.intervalMs,
        cleanupIntervalMs: this.options.cleanupIntervalMs,
      },
      "Starting bootstrap job...",
    )

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

    logger.info("Bootstrap job started (reconcile + cleanup)")
  }

  async reconcile() {
    const startTime = Date.now()
    logger.info("Starting reconciliation...")

    try {
      const windowEnd = new Date(
        Date.now() + BOOTSTRAP_WINDOW_HOURS * 60 * 60 * 1000,
      )

      let hasMore = true
      let offset = 0
      let totalReconciled = 0
      let totalFailed = 0

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

        const results = await Promise.allSettled(
          dispatches.map((dispatch) =>
            this.dragonfly.addToSchedule(
              dispatch.bucket,
              dispatch.id,
              Number(dispatch.runAtMs),
            ),
          ),
        )

        const failed = results.filter((r) => r.status === "rejected")
        if (failed.length > 0) {
          totalFailed += failed.length
          logger.warn(
            { count: failed.length, batch: dispatches.length },
            "Some dispatches failed to reconcile in batch",
          )
        }

        totalReconciled += dispatches.length - failed.length
        offset += BATCH_SIZE

        logger.debug(
          {
            batch: dispatches.length,
            total: totalReconciled,
            failed: totalFailed,
          },
          "Reconciled batch",
        )

        if (dispatches.length < BATCH_SIZE) {
          hasMore = false
          break
        }
      }

      const duration = Date.now() - startTime
      this.lastReconcileRun = new Date()

      logger.info(
        {
          totalReconciled,
          totalFailed,
          duration,
          windowHours: BOOTSTRAP_WINDOW_HOURS,
        },
        "Reconciliation completed",
      )
    } catch (error) {
      logger.error({ error }, "Error in reconciliation")
      throw error
    }
  }

  stop() {
    if (!this.running) {
      return
    }

    logger.info("Stopping bootstrap job...")
    this.running = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
    }

    logger.info("Bootstrap job stopped")
  }

  async cleanupOrphans() {
    const startTime = Date.now()
    logger.info("Starting orphan cleanup...")

    try {
      const bucketStats: Record<number, { removed: number; failed: number }> =
        {}

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
          const results = await Promise.allSettled(
            orphanIds.map((id) => this.dragonfly.removeFromAll(bucket, id)),
          )

          const failed = results.filter((r) => r.status === "rejected").length
          const removed = orphanIds.length - failed

          bucketStats[bucket] = { removed, failed }

          logger.debug({ bucket, removed, failed }, "Removed orphan dispatches")
        }
      }

      const totalRemoved = Object.values(bucketStats).reduce(
        (sum, stat) => sum + stat.removed,
        0,
      )
      const totalFailed = Object.values(bucketStats).reduce(
        (sum, stat) => sum + stat.failed,
        0,
      )

      const duration = Date.now() - startTime
      this.lastCleanupRun = new Date()

      logger.info(
        {
          totalRemoved,
          totalFailed,
          buckets: Object.keys(bucketStats).length,
          duration,
        },
        "Orphan cleanup completed",
      )
    } catch (error) {
      logger.error({ error }, "Error during orphan cleanup")
      throw error
    }
  }

  private async getZSetMembers(bucket: number, type: "schedule" | "retry") {
    try {
      return await this.dragonfly.getZSetMembers(bucket, type)
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

let bootstrapJob: BootstrapJob | null = null

export function getBootstrapJob(): BootstrapJob {
  if (!bootstrapJob) {
    const intervalMs = Number.parseInt(
      process.env.BOOTSTRAP_INTERVAL_MS ||
        BOOTSTRAP_INTERVAL_MS_DEFAULT.toString(),
      10,
    )

    const cleanupIntervalMs = Number.parseInt(
      process.env.CLEANUP_INTERVAL_MS || CLEANUP_INTERVAL_MS_DEFAULT.toString(),
      10,
    )

    bootstrapJob = new BootstrapJob({ intervalMs, cleanupIntervalMs })
  }

  return bootstrapJob
}
