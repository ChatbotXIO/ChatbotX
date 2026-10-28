import { sequenceDispatchRepository } from "@chatbotx.io/database/repositories"
import { sequenceConnections } from "@chatbotx.io/redis"
import { SchedulerClient } from "@chatbotx.io/scheduler"
import {
  getSequenceSchedulerQueue,
  type SequenceSchedulerJobData,
  type SequenceSchedulerQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { isShutdownRequested, onShutdown, runWorker } from "../lib/shutdown"

import { getAssignedBuckets } from "./buckets"

const CLAIM_LIMIT = 100
const LOCK_TTL_MS = 30_000
const TICK_INTERVAL_MS = 500

interface SchedulerConfig {
  buckets: number[]
  claimLimit: number
  lockTtlMs: number
  tickIntervalMs: number
}

type DispatchSource = "schedule" | "retry"

type ClaimedDispatch = {
  dispatchId: string
  source: DispatchSource
}

export class SchedulerWorker {
  private readonly config: SchedulerConfig
  private _scheduler: SchedulerClient | null = null
  private _queue: SequenceSchedulerQueue | null = null
  private running = false
  private readonly timers = new Map<number, NodeJS.Timeout>()
  // Ticks still running. stop() waits for them: a tick removes dispatches from
  // the ZSET before publishing them, so exiting mid-tick loses them until the
  // hourly reconcile.
  private readonly runningTicks = new Set<Promise<void>>()

  private get scheduler(): SchedulerClient {
    if (!this._scheduler) {
      throw new Error("Scheduler not initialized. Call start() first.")
    }
    return this._scheduler
  }

  private get queue(): SequenceSchedulerQueue {
    if (!this._queue) {
      throw new Error(
        "Sequence scheduler queue not initialized. Call start() first.",
      )
    }
    return this._queue
  }

  constructor(config: Partial<SchedulerConfig> = {}) {
    this.config = {
      buckets: config.buckets || getAssignedBuckets(),
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
    const queue = await getSequenceSchedulerQueue()
    if (!queue) {
      throw new Error("Sequence scheduler queue is unavailable")
    }
    // Shutdown may have run stop() while Redis was connecting; it returned
    // early (not running yet), so ticks started now would never be awaited.
    if (isShutdownRequested()) {
      logger.warn(
        "Shutdown requested during startup; not starting scheduler worker",
      )
      return
    }
    this._queue = queue

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
        logger.error({ err: error, bucket }, "Error processing bucket")
      }

      if (this.running) {
        const timer = setTimeout(run, this.config.tickIntervalMs)
        this.timers.set(bucket, timer)
      }
    }

    const run = () => {
      const running = tick().finally(() => this.runningTicks.delete(running))
      this.runningTicks.add(running)
    }

    run()
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

    const [scheduledClaims, retryClaims] = await Promise.all([
      this.claimCandidates({
        bucket,
        ids: scheduleCandidates,
        source: "schedule",
        remove: (dispatchId) =>
          this.scheduler.removeFromSchedule(bucket, dispatchId),
      }),
      this.claimCandidates({
        bucket,
        ids: retryCandidates,
        source: "retry",
        remove: (dispatchId) =>
          this.scheduler.removeFromRetry(bucket, dispatchId),
      }),
    ])
    const claimed = [...scheduledClaims, ...retryClaims]

    if (claimed.length === 0) {
      return
    }

    try {
      await this.publishDispatches(bucket, claimed)
    } catch (err) {
      logger.error(
        { err, bucket, count: claimed.length },
        "Failed to publish claimed dispatches; re-inserting for retry on next tick",
      )
      await this.reinsertClaimed(bucket, claimed)
    }
  }

  private async claimCandidates({
    bucket,
    ids,
    source,
    remove,
  }: {
    bucket: number
    ids: string[]
    source: DispatchSource
    remove: (dispatchId: string) => Promise<void>
  }): Promise<ClaimedDispatch[]> {
    const claims = await Promise.all(
      ids.map(async (dispatchId) => {
        try {
          await this.scheduler.withLock(
            bucket,
            dispatchId,
            this.config.lockTtlMs / 1000,
            () => remove(dispatchId),
          )
          return { dispatchId, source }
        } catch (error) {
          logger.debug(
            { err: error, dispatchId, bucket },
            "Dispatch claim skipped",
          )
          return
        }
      }),
    )

    return claims.flatMap((claim) => (claim ? [claim] : []))
  }

  private async reinsertClaimed(
    bucket: number,
    claimed: ClaimedDispatch[],
  ): Promise<void> {
    const nowRetryMs = Date.now()
    const scheduleEntries = claimed
      .filter((entry) => entry.source === "schedule")
      .map((entry) => ({
        bucket,
        dispatchId: entry.dispatchId,
        runAtMs: nowRetryMs,
      }))
    const retryEntries = claimed.filter((entry) => entry.source === "retry")
    const reinsertions = [
      {
        dispatchIds: scheduleEntries.map((entry) => entry.dispatchId),
        promise: this.scheduler.batchAddToSchedule(scheduleEntries),
      },
      ...retryEntries.map((entry) => ({
        dispatchIds: [entry.dispatchId],
        promise: this.scheduler.addToRetry(
          bucket,
          entry.dispatchId,
          nowRetryMs,
        ),
      })),
    ]
    const results = await Promise.allSettled(
      reinsertions.map((reinsertion) => reinsertion.promise),
    )
    const failed = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ err: result.reason, dispatchIds: reinsertions[index].dispatchIds }]
        : [],
    )

    if (failed.length > 0) {
      logger.error(
        {
          err: failed[0].err,
          bucket,
          dispatchIds: failed.flatMap((failure) => failure.dispatchIds),
        },
        "Failed to re-insert claimed dispatches after publish failure; these dispatches are lost from scheduling until the hourly reconcile timer recovers them",
      )
    }
  }

  async publishDispatches(
    bucket: number,
    dispatches: Pick<ClaimedDispatch, "dispatchId">[],
  ) {
    const dispatchIds = dispatches.map((dispatch) => dispatch.dispatchId)
    const pendingDispatches =
      await sequenceDispatchRepository.listPendingWorkspaceIds({
        ids: dispatchIds,
      })
    const workspaceByDispatchId = new Map(
      pendingDispatches.map((dispatch) => [dispatch.id, dispatch.workspaceId]),
    )

    const jobs = dispatches.flatMap((dispatch) => {
      const workspaceId = workspaceByDispatchId.get(dispatch.dispatchId)
      if (!workspaceId) {
        return []
      }

      const data: SequenceSchedulerJobData = {
        dispatchId: dispatch.dispatchId,
        claimedAt: Date.now(),
        bucket,
        workspaceId,
      }
      return {
        name: dispatch.dispatchId,
        data,
        opts: { jobId: `sequence-${dispatch.dispatchId}` },
      }
    })

    if (jobs.length === 0) {
      return
    }

    await this.queue.addBulk(jobs)
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

    await Promise.allSettled([...this.runningTicks])

    this._queue = null
  }
}

const scheduler = new SchedulerWorker()
const shouldAutoStart = process.env.NODE_ENV !== "test" && !process.env.VITEST

async function startSchedulerWorker() {
  logger.info("Starting scheduler worker")

  await scheduler.start()
  logger.info("Scheduler worker fully operational")
}

if (shouldAutoStart) {
  runWorker("sequence-producer", startSchedulerWorker)
  onShutdown("sequence-producer", () => scheduler.stop())
}
