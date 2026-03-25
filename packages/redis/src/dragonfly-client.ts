import logger from "@aha.chat/logger"
import Redis, { type RedisOptions } from "ioredis"

export class DragonflyClient {
  private readonly client: Redis
  constructor(connectionString: string, password?: string) {
    const options: RedisOptions = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
    }
    if (password) {
      options.password = password
    }
    this.client = new Redis(connectionString, options)
    this.client.on("error", (err) => {
      logger.error({ err }, "Dragonfly connection error")
    })
    this.client.on("connect", () => {
      logger.info("Connected to Dragonfly")
    })
    this.client.on("ready", () => {
      logger.info("Dragonfly client ready")
    })
  }
  async connect(): Promise<void> {
    await this.client.connect()
  }
  async disconnect(): Promise<void> {
    await this.client.quit()
  }

  isConnected(): boolean {
    return this.client.status === "ready"
  }

  isConnectingOrConnected(): boolean {
    return (
      this.client.status === "ready" ||
      this.client.status === "connect" ||
      this.client.status === "connecting"
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
  async addToSchedule(
    bucket: number,
    dispatchId: string,
    runAtMs: number,
  ): Promise<void> {
    const key = this.getScheduleKey(bucket)
    await this.client.zadd(key, runAtMs, dispatchId)
  }
  async addToRetry(
    bucket: number,
    dispatchId: string,
    retryAtMs: number,
  ): Promise<void> {
    const key = this.getRetryKey(bucket)
    await this.client.zadd(key, retryAtMs, dispatchId)
  }
  async removeFromSchedule(bucket: number, dispatchId: string): Promise<void> {
    const key = this.getScheduleKey(bucket)
    await this.client.zrem(key, dispatchId)
  }
  async removeFromRetry(bucket: number, dispatchId: string): Promise<void> {
    const key = this.getRetryKey(bucket)
    await this.client.zrem(key, dispatchId)
  }
  async removeFromAll(bucket: number, dispatchId: string): Promise<void> {
    await Promise.all([
      this.removeFromSchedule(bucket, dispatchId),
      this.removeFromRetry(bucket, dispatchId),
    ])
  }
  async getDue(key: string, nowMs: number, limit: number): Promise<string[]> {
    const result = await this.client.zrangebyscore(
      key,
      "-inf",
      nowMs.toString(),
      "LIMIT",
      0,
      limit,
    )
    return result
  }
  async acquireLock(
    bucket: number,
    dispatchId: string,
    lockTtlMs: number,
  ): Promise<boolean> {
    const lockKey = this.getLockKey(bucket, dispatchId)
    const result = await this.client.set(lockKey, "1", "PX", lockTtlMs, "NX")
    return result === "OK"
  }
  async releaseLock(bucket: number, dispatchId: string): Promise<void> {
    const lockKey = this.getLockKey(bucket, dispatchId)
    await this.client.del(lockKey)
  }
  async getScheduleCount(bucket: number): Promise<number> {
    const key = this.getScheduleKey(bucket)
    return await this.client.zcard(key)
  }
  async getRetryCount(bucket: number): Promise<number> {
    const key = this.getRetryKey(bucket)
    return await this.client.zcard(key)
  }
  async batchAddToSchedule(
    items: Array<{ bucket: number; dispatchId: string; runAtMs: number }>,
  ): Promise<void> {
    if (items.length === 0) {
      return
    }
    const pipeline = this.client.pipeline()
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
    const pipeline = this.client.pipeline()
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
    return await this.client.zrange(key, 0, -1)
  }
}
let dragonflyClient: DragonflyClient | null = null
export function getDragonflyClient(): DragonflyClient {
  if (!dragonflyClient) {
    const connectionString =
      process.env.DRAGONFLY_URL || "redis://localhost:6380"
    const password = process.env.DRAGONFLY_PASSWORD
    dragonflyClient = new DragonflyClient(connectionString, password)
  }
  return dragonflyClient
}

export function resetDragonflyClient(): void {
  dragonflyClient = null
}

export async function initializeDragonfly(): Promise<DragonflyClient> {
  const client = getDragonflyClient()

  // Only connect if not already connecting or connected
  if (!client.isConnectingOrConnected()) {
    await client.connect()
  }

  return client
}
