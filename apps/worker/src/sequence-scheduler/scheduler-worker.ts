import { getDragonflyClient } from "@aha.chat/scheduler"
import { Kafka, type Producer } from "kafkajs"
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
  private readonly dragonfly = getDragonflyClient()
  private readonly producer: Producer
  private readonly kafka: Kafka
  private running = false
  private timers: NodeJS.Timeout[] = []

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      buckets: config.buckets || this.getAssignedBuckets(),
      tickIntervalMs: config.tickIntervalMs || TICK_INTERVAL_MS,
      claimLimit: config.claimLimit || CLAIM_LIMIT,
      lockTtlMs: config.lockTtlMs || LOCK_TTL_MS,
    }

    const kafkaBrokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(
      ",",
    )

    const sasl =
      process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD
        ? {
            mechanism: "plain" as const,
            username: process.env.KAFKA_SASL_USERNAME,
            password: process.env.KAFKA_SASL_PASSWORD,
          }
        : undefined

    this.kafka = new Kafka({
      clientId: "sequence-scheduler",
      brokers: kafkaBrokers,
      ssl: process.env.KAFKA_SSL_ENABLED === "true",
      sasl,
      retry: {
        retries: 5,
        initialRetryTime: 300,
        maxRetryTime: 30_000,
      },
    })

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 60_000,
    })
  }

  async getHealth(): Promise<{
    running: boolean
    buckets: number[]
    stats: Record<number, { schedule: number; retry: number }>
  }> {
    const stats: Record<number, { schedule: number; retry: number }> = {}

    for (const bucket of this.config.buckets) {
      const schedule = await this.dragonfly.getScheduleCount(bucket)
      const retry = await this.dragonfly.getRetryCount(bucket)
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
      logger.info("Scheduler worker is already running")
      return
    }

    await this.producer.connect()

    this.running = true

    for (const bucket of this.config.buckets) {
      this.startBucketScheduler(bucket)
    }

    logger.info(
      `Scheduler worker started with ${this.config.buckets.length} buckets`,
    )
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
      this.dragonfly.getDue(
        this.dragonfly.getScheduleKey(bucket),
        nowMs,
        this.config.claimLimit,
      ),
      this.dragonfly.getDue(
        this.dragonfly.getRetryKey(bucket),
        nowMs,
        this.config.claimLimit,
      ),
    ])

    const candidates = [...scheduleCandidates, ...retryCandidates]
    if (candidates.length === 0) {
      return
    }

    const claimed: { dispatchId: string; bucket: number }[] = []

    await Promise.all(
      candidates.map(async (dispatchId) => {
        const locked = await this.dragonfly.acquireLock(
          bucket,
          dispatchId,
          this.config.lockTtlMs,
        )

        if (locked) {
          await this.dragonfly.removeFromSchedule(bucket, dispatchId)
          claimed.push({
            dispatchId,
            bucket,
          })
        }
      }),
    )

    if (claimed.length > 0) {
      logger.info(`Claimed ${claimed.length} dispatches from bucket ${bucket}`)
      await this.publishDispatches(claimed)
    }
  }

  async publishDispatches(
    dispatches: { dispatchId: string; bucket: number }[],
  ) {
    const messages = dispatches.map((dispatch) => ({
      key: dispatch.dispatchId,
      value: JSON.stringify({
        dispatchId: dispatch.dispatchId,
        claimedAt: Date.now(),
        bucket: dispatch.bucket,
      }),
    }))

    await this.producer.send({
      topic: "seq.dispatch.run",
      messages,
    })
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

    await this.producer.disconnect()
    await this.dragonfly.disconnect()
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

let schedulerWorker: SchedulerWorker | null = null

export function getSchedulerWorker() {
  if (!schedulerWorker) {
    schedulerWorker = new SchedulerWorker()
  }

  return schedulerWorker
}
