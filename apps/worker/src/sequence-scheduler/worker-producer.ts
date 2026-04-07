import { createProducer, type Producer } from "@chatbotx.io/kafka"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import { logger } from "../lib/logger"
import { KAFKA_TOPIC } from "./services/constants"

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

class SchedulerWorker {
  private readonly config: SchedulerConfig
  private _scheduler: SchedulerClient | null = null
  private readonly producer: Producer<string, string, string, string>
  private running = false
  private timers: NodeJS.Timeout[] = []

  private get scheduler(): SchedulerClient {
    if (!this._scheduler) {
      throw new Error("Scheduler not initialized. Call start() first.")
    }
    return this._scheduler
  }

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      buckets: config.buckets || this.getAssignedBuckets(),
      tickIntervalMs: config.tickIntervalMs || TICK_INTERVAL_MS,
      claimLimit: config.claimLimit || CLAIM_LIMIT,
      lockTtlMs: config.lockTtlMs || LOCK_TTL_MS,
    }

    this.producer = createProducer("sequence-scheduler")
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
        this.timers.push(timer)
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
    const messages = dispatches.map((dispatch) => ({
      topic: KAFKA_TOPIC,
      key: dispatch.dispatchId,
      value: JSON.stringify({
        dispatchId: dispatch.dispatchId,
        claimedAt: Date.now(),
        bucket: dispatch.bucket,
      }),
    }))

    await this.producer.send({ messages })
  }

  async stop() {
    if (!this.running) {
      return
    }

    this.running = false

    for (const timer of this.timers) {
      clearTimeout(timer)
    }
    this.timers = []

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

let isShuttingDown = false

async function startSchedulerWorker() {
  console.log("Starting scheduler worker...")

  try {
    await scheduler.start()
    console.log("Scheduler worker fully operational")
  } catch (error) {
    console.error("Error starting scheduler worker:", error)
    throw error
  }
}

async function stopSchedulerWorker() {
  console.log("Stopping scheduler worker...")

  try {
    await scheduler.stop()
    console.log("Scheduler worker stopped")
  } catch (error) {
    console.error("Error stopping scheduler worker:", error)
    throw error
  }
}

startSchedulerWorker().catch((error) => {
  console.error("Error starting scheduler worker:", error)
  process.exitCode = 1
})

const handleShutdownSignal = async (signal: "SIGINT" | "SIGTERM") => {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  console.log(`${signal} received, shutting down scheduler worker...`)

  try {
    await stopSchedulerWorker()
    process.exit(0)
  } catch (error) {
    console.error("Error during scheduler worker shutdown:", error)
    process.exit(1)
  }
}

process.on("SIGINT", () => {
  handleShutdownSignal("SIGINT").catch((error) => {
    console.error("Unhandled SIGINT shutdown error:", error)
    process.exit(1)
  })
})

process.on("SIGTERM", () => {
  handleShutdownSignal("SIGTERM").catch((error) => {
    console.error("Unhandled SIGTERM shutdown error:", error)
    process.exit(1)
  })
})
