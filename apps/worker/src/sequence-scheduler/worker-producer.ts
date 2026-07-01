import { db } from "@chatbotx.io/database/client"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import {
  type MessagingProducer,
  SEQUENCE_SCHEDULER_QUEUE_NAME,
} from "@chatbotx.io/worker-config"
import { createProducer } from "@chatbotx.io/worker-config/message-queue/factory"
import { logger } from "../lib/logger"

const TOTAL_BUCKETS = 256
const CLAIM_LIMIT = 100
const LOCK_TTL_MS = 30_000
const TICK_INTERVAL_MS = 500

interface SchedulerConfig {
  buckets: number[]
  claimLimit: number
  lockTtlMs: number
  tickIntervalMs: number
}

export class SchedulerWorker {
  private readonly config: SchedulerConfig
  private _scheduler: SchedulerClient | null = null
  private _producer: MessagingProducer | null = null
  private running = false
  private readonly timers = new Map<number, NodeJS.Timeout>()

  private get scheduler(): SchedulerClient {
    if (!this._scheduler) {
      throw new Error("Scheduler not initialized. Call start() first.")
    }
    return this._scheduler
  }

  private get producer(): MessagingProducer {
    if (!this._producer) {
      throw new Error("Producer not initialized. Call start() first.")
    }
    return this._producer
  }

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      buckets: config.buckets || this.getAssignedBuckets(),
      tickIntervalMs: config.tickIntervalMs || TICK_INTERVAL_MS,
      claimLimit: config.claimLimit || CLAIM_LIMIT,
      lockTtlMs: config.lockTtlMs || LOCK_TTL_MS,
    }
  }

  async getHealth(): Promise<{
    running: boolean
    buckets: number[]
    stats: Record<number, { schedule: number; retry: number }>
  }> {
    const stats: Record<number, { schedule: number; retry: number }> = {}

    for (const bucket of this.config.buckets) {
      const schedule = await this.scheduler.getScheduleCount(bucket)
      const retry = await this.scheduler.getRetryCount(bucket)
      stats[bucket] = { schedule, retry }
    }

    return {
      running: this.running,
      buckets: this.config.buckets,
      stats,
    }
  }

  async start() {
    if (this.running) {
      return
    }

    const redisClient = await sequenceConnections.useExisting()
    this._scheduler = new SchedulerClient(redisClient)
    this._producer = await createProducer({
      topic: SEQUENCE_SCHEDULER_QUEUE_NAME,
      clientId: "sequence-scheduler",
    })

    this.running = true

    for (const bucket of this.config.buckets) {
      this.startBucketScheduler(bucket)
    }
  }

  private startBucketScheduler(bucket: number) {
    const tick = async () => {
      if (!this.running) {
        return
      }

      try {
        await this.processBucket(bucket)
      } catch (error) {
        logger.error(error, `Error processing bucket ${bucket}`)
      }

      if (this.running) {
        const timer = setTimeout(tick, this.config.tickIntervalMs)
        this.timers.set(bucket, timer)
      }
    }

    tick()
  }

  async processBucket(bucket: number) {
    const nowMs = Date.now()

    const [scheduleCandidates, retryCandidates] = await Promise.all([
      this.scheduler.getDue(
        this.scheduler.getScheduleKey(bucket),
        nowMs,
        this.config.claimLimit,
      ),
      this.scheduler.getDue(
        this.scheduler.getRetryKey(bucket),
        nowMs,
        this.config.claimLimit,
      ),
    ])

    if (scheduleCandidates.length + retryCandidates.length === 0) {
      return
    }

    const claimed: { dispatchId: string; bucket: number }[] = []

    await Promise.all([
      ...scheduleCandidates.map(async (dispatchId) => {
        try {
          await this.scheduler.withLock(
            bucket,
            dispatchId,
            this.config.lockTtlMs / 1000,
            async () => {
              await this.scheduler.removeFromSchedule(bucket, dispatchId)
              claimed.push({
                dispatchId,
                bucket,
              })
            },
          )
        } catch {
          // Lock not acquired, skip this dispatch
        }
      }),
      ...retryCandidates.map(async (dispatchId) => {
        try {
          await this.scheduler.withLock(
            bucket,
            dispatchId,
            this.config.lockTtlMs / 1000,
            async () => {
              await this.scheduler.removeFromRetry(bucket, dispatchId)
              claimed.push({
                dispatchId,
                bucket,
              })
            },
          )
        } catch {
          // Lock not acquired, skip this dispatch
        }
      }),
    ])

    if (claimed.length > 0) {
      await this.publishDispatches(claimed)
    }
  }

  async publishDispatches(
    dispatches: { dispatchId: string; bucket: number }[],
  ) {
    const dispatchIds = dispatches.map((dispatch) => dispatch.dispatchId)
    const pendingDispatches = await db.query.sequenceDispatchModel.findMany({
      where: {
        id: { in: dispatchIds },
        status: "pending",
      },
      columns: {
        id: true,
        workspaceId: true,
      },
    })
    const workspaceByDispatchId = new Map(
      pendingDispatches.map((dispatch) => [dispatch.id, dispatch.workspaceId]),
    )

    const messages = dispatches.flatMap((dispatch) => {
      const workspaceId = workspaceByDispatchId.get(dispatch.dispatchId)
      if (!workspaceId) {
        return []
      }

      return {
        key: dispatch.dispatchId,
        value: JSON.stringify({
          dispatchId: dispatch.dispatchId,
          claimedAt: Date.now(),
          bucket: dispatch.bucket,
          workspaceId,
        }),
      }
    })

    if (messages.length === 0) {
      return
    }

    await this.producer.send(messages)
  }

  async stop() {
    if (!this.running) {
      return
    }

    this.running = false

    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()

    await this.producer.close()
  }

  private getAssignedBuckets(): number[] {
    const bucketRange = process.env.SCHEDULER_BUCKET_RANGE

    if (bucketRange) {
      if (bucketRange.includes(",")) {
        return bucketRange.split(",").map(Number)
      }

      const [start, end] = bucketRange.split("-").map(Number)
      return Array.from({ length: end - start + 1 }, (_, i) => start + i)
    }

    return Array.from({ length: TOTAL_BUCKETS }, (_, i) => i)
  }
}

const scheduler = new SchedulerWorker()
const shouldAutoStart = process.env.NODE_ENV !== "test" && !process.env.VITEST

let isShuttingDown = false

async function startSchedulerWorker() {
  logger.info("Starting scheduler worker")

  try {
    await scheduler.start()
    logger.info("Scheduler worker fully operational")
  } catch (error) {
    logger.error(error, "Error starting scheduler worker")
    throw error
  }
}

async function stopSchedulerWorker() {
  logger.info("Stopping scheduler worker")

  try {
    await scheduler.stop()
    logger.info("Scheduler worker stopped")
  } catch (error) {
    logger.error(error, "Error stopping scheduler worker")
    throw error
  }
}

if (shouldAutoStart) {
  startSchedulerWorker().catch((error) => {
    logger.error(error, "Error starting scheduler worker")
    process.exitCode = 1
  })
}

const handleShutdownSignal = async (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  logger.info({ signal }, "Shutdown signal received")

  try {
    await stopSchedulerWorker()
    process.exit(0)
  } catch (error) {
    logger.error(error, "Error during scheduler worker shutdown")
    process.exit(1)
  }
}

if (shouldAutoStart) {
  process.on("SIGINT", () => {
    handleShutdownSignal("SIGINT").catch((error) => {
      logger.error(error, "Unhandled SIGINT shutdown error")
      process.exit(1)
    })
  })

  process.on("SIGTERM", () => {
    handleShutdownSignal("SIGTERM").catch((error) => {
      logger.error(error, "Unhandled SIGTERM shutdown error")
      process.exit(1)
    })
  })
}
