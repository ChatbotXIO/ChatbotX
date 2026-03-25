import { distributedLockFactory } from "@chatbotx.io/redis"
import type Redis from "ioredis"

export class SchedulerClient {
  protected readonly redis: Redis
  readonly lock: ReturnType<typeof distributedLockFactory>

  constructor(redis: Redis) {
    this.redis = redis
    this.lock = distributedLockFactory(() => Promise.resolve(redis))
  }

  isConnected(): boolean {
    return this.redis.status === "ready"
  }

  isConnectingOrConnected(): boolean {
    return (
      this.redis.status === "ready" ||
      this.redis.status === "connect" ||
      this.redis.status === "connecting"
    )
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

  async acquireLock(
    bucket: number,
    dispatchId: string,
    lockTtlMs: number,
  ): Promise<boolean> {
    const key = this.getLockKey(bucket, dispatchId)
    try {
      await this.lock.runExclusive({
        key,
        timeoutInSeconds: lockTtlMs / 1000,
        fn: async () => {
          // Lock acquired successfully
        },
      })
      return true
    } catch {
      return false
    }
  }

  async releaseLock(_bucket: number, _dispatchId: string): Promise<void> {
    // Lock is automatically released by distributedLock.runExclusive
    // This method is kept for backward compatibility but does nothing
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
      nowMs.toString(),
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
    await pipeline.exec()
  }

  async batchRemoveFromAll(
    items: Array<{ bucket: number; dispatchId: string }>,
  ): Promise<void> {
    if (items.length === 0) {
      return
    }
    const pipeline = this.redis.pipeline()
    for (const { bucket, dispatchId } of items) {
      const scheduleKey = this.getScheduleKey(bucket)
      const retryKey = this.getRetryKey(bucket)
      pipeline.zrem(scheduleKey, dispatchId)
      pipeline.zrem(retryKey, dispatchId)
    }
    await pipeline.exec()
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
