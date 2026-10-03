import {
  type DistributedLock,
  distributedLockFactory,
} from "@chatbotx.io/redis"

import type Redis from "ioredis"
import type { ChainableCommander } from "ioredis"

export class SchedulerClient {
  protected readonly redis: Redis
  readonly lock: DistributedLock

  constructor(redis: Redis) {
    this.redis = redis
    this.lock = distributedLockFactory(() => Promise.resolve(redis))
  }
  private async execOrThrow(pipeline: ChainableCommander): Promise<void> {
    const results = await pipeline.exec()
    if (!results) {
      throw new Error("Redis pipeline did not return results")
    }

    const errors = results.flatMap(([error]) => (error ? [error] : []))
    if (errors.length > 0) {
      throw new AggregateError(errors, "Redis pipeline failed")
    }
  }

  getScheduleKey(bucket: number): string {
    return `seq:dispatch:{${bucket}}:schedule`
  }

  getRetryKey(bucket: number): string {
    return `seq:dispatch:{${bucket}}:retry`
  }

  getLockKey(bucket: number, dispatchId: string): string {
    return `seq:dispatch:{${bucket}}:lock:${dispatchId}`
  }

  async withLock<T>(
    bucket: number,
    dispatchId: string,
    timeoutInSeconds: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = this.getLockKey(bucket, dispatchId)
    return await this.lock.runExclusive({ key, timeoutInSeconds, fn })
  }

  async addToSchedule(
    bucket: number,
    dispatchId: string,
    runAtMs: number,
  ): Promise<void> {
    const key = this.getScheduleKey(bucket)
    await this.redis.zadd(key, runAtMs, dispatchId)
  }

  async addToRetry(
    bucket: number,
    dispatchId: string,
    retryAtMs: number,
  ): Promise<void> {
    const key = this.getRetryKey(bucket)
    await this.redis.zadd(key, retryAtMs, dispatchId)
  }

  async removeFromSchedule(bucket: number, dispatchId: string): Promise<void> {
    const key = this.getScheduleKey(bucket)
    await this.redis.zrem(key, dispatchId)
  }

  async removeFromRetry(bucket: number, dispatchId: string): Promise<void> {
    const key = this.getRetryKey(bucket)
    await this.redis.zrem(key, dispatchId)
  }

  async removeFromAll(bucket: number, dispatchId: string): Promise<void> {
    await Promise.all([
      this.removeFromSchedule(bucket, dispatchId),
      this.removeFromRetry(bucket, dispatchId),
    ])
  }

  async getDue(key: string, nowMs: number, limit: number): Promise<string[]> {
    const result = await this.redis.zrangebyscore(
      key,
      "-inf",
      nowMs,
      "LIMIT",
      0,
      limit,
    )
    return result
  }

  async getScheduleCount(bucket: number): Promise<number> {
    const key = this.getScheduleKey(bucket)
    return await this.redis.zcard(key)
  }

  async getRetryCount(bucket: number): Promise<number> {
    const key = this.getRetryKey(bucket)
    return await this.redis.zcard(key)
  }

  async batchAddToSchedule(
    items: Array<{ bucket: number; dispatchId: string; runAtMs: number }>,
  ): Promise<void> {
    if (items.length === 0) {
      return
    }
    const pipeline = this.redis.pipeline()
    for (const { bucket, dispatchId, runAtMs } of items) {
      const key = this.getScheduleKey(bucket)
      pipeline.zadd(key, runAtMs, dispatchId)
    }
    await this.execOrThrow(pipeline)
  }

  async getZSetMembers(
    bucket: number,
    type: "schedule" | "retry",
  ): Promise<string[]> {
    const key =
      type === "schedule"
        ? this.getScheduleKey(bucket)
        : this.getRetryKey(bucket)
    return await this.redis.zrange(key, 0, -1)
  }
}
