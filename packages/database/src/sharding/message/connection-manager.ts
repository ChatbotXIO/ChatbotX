import type { Pool } from "pg"
import type { DatabaseClient } from "../../client"
import { logger } from "../../logger"
import {
  createShardPool,
  type ShardConfig,
  ShardNotActiveError,
  ShardUnreachableError,
} from "../shared"
import {
  createMessageShardClient,
  type MessageShardDatabaseClient,
} from "./client"
import {
  MessageShardRegistry,
  type MessageShardTimeRangeInfo,
} from "./registry"

interface PoolEntry {
  client: MessageShardDatabaseClient
  lastUsed: Date
  pool: Pool
}

interface ActiveShardCache {
  cachedAt: Date
  shard: ShardConfig
}

export class MessageShardConnectionManager {
  private readonly pools: Map<string, PoolEntry> = new Map()
  private shardingEnabled: boolean | null = null
  private activeShardCache: ActiveShardCache | null = null
  private lastEvictedAt: Date | null = null
  private readonly registry: MessageShardRegistry

  private static readonly MAX_POOLS = 10
  private static readonly ACTIVE_SHARD_TTL_MS = 30_000

  constructor(mainDb: DatabaseClient, registry?: MessageShardRegistry) {
    this.registry = registry ?? new MessageShardRegistry(mainDb)
  }

  async isShardingEnabled(): Promise<boolean> {
    if (this.shardingEnabled === null) {
      this.shardingEnabled = (await this.registry.countShards()) > 0
    }
    return this.shardingEnabled
  }

  invalidateShardingCache(): void {
    this.shardingEnabled = null
  }

  async getActiveShardForWrite(): Promise<MessageShardDatabaseClient> {
    if (!(await this.isShardingEnabled())) {
      throw new ShardNotActiveError(
        "Message sharding is not enabled. No shards configured.",
      )
    }

    if (this.activeShardCache) {
      const age = Date.now() - this.activeShardCache.cachedAt.getTime()
      if (age < MessageShardConnectionManager.ACTIVE_SHARD_TTL_MS) {
        return this.getShardClient(this.activeShardCache.shard)
      }
      this.activeShardCache = null
    }

    const activeShard = await this.registry.findActiveForWrite()

    if (!activeShard) {
      throw new ShardNotActiveError()
    }

    this.activeShardCache = {
      shard: activeShard,
      cachedAt: new Date(),
    }

    return this.getShardClient(activeShard)
  }

  invalidateActiveShardCache(): void {
    this.activeShardCache = null
  }

  async getShardsForTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<MessageShardTimeRangeInfo[]> {
    return await this.registry.findShardsForTimeRange(startTime, endTime)
  }

  async getShardClient(
    shard: ShardConfig,
  ): Promise<MessageShardDatabaseClient> {
    const existing = this.pools.get(shard.id)
    if (existing) {
      existing.lastUsed = new Date()
      return existing.client
    }

    if (this.pools.size >= MessageShardConnectionManager.MAX_POOLS) {
      this.evictLeastRecentlyUsed()
    }

    const pool = createShardPool(shard)

    await this.healthCheck(pool, shard.id)

    const client = createMessageShardClient(pool)

    this.pools.set(shard.id, {
      pool,
      client,
      lastUsed: new Date(),
    })

    return client
  }

  private async healthCheck(pool: Pool, shardId: string): Promise<void> {
    try {
      await pool.query("SELECT 1")
    } catch (error) {
      await pool.end().catch(() => {
        // ignore close errors during health check failure
      })
      throw new ShardUnreachableError(`Shard ${shardId} health check failed`, {
        cause: error,
      })
    }
  }

  async shutdown(): Promise<void> {
    const closePromises: Promise<void>[] = []

    for (const [shardId, entry] of this.pools) {
      closePromises.push(
        entry.pool.end().catch((error) => {
          logger.error({ shardId, error }, "Error closing pool for shard")
        }),
      )
    }

    await Promise.all(closePromises)
    this.pools.clear()
    this.shardingEnabled = null
  }

  getPoolStats(): {
    totalPools: number
    maxPools: number
    lastEvictedAt: Date | null
    pools: Array<{
      shardId: string
      lastUsed: Date
      totalCount: number
      idleCount: number
      waitingCount: number
    }>
  } {
    const poolDetails = Array.from(this.pools.entries()).map(
      ([shardId, entry]) => ({
        shardId,
        lastUsed: entry.lastUsed,
        totalCount: entry.pool.totalCount,
        idleCount: entry.pool.idleCount,
        waitingCount: entry.pool.waitingCount,
      }),
    )

    return {
      totalPools: this.pools.size,
      maxPools: MessageShardConnectionManager.MAX_POOLS,
      lastEvictedAt: this.lastEvictedAt,
      pools: poolDetails,
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldest: [string, PoolEntry] | null = null

    for (const entry of this.pools.entries()) {
      if (!oldest || entry[1].lastUsed < oldest[1].lastUsed) {
        oldest = entry
      }
    }

    if (oldest) {
      const [shardId, poolEntry] = oldest
      poolEntry.pool.end().catch((error) => {
        logger.error({ shardId, error }, "Error closing evicted pool for shard")
      })
      this.pools.delete(shardId)
      this.lastEvictedAt = new Date()
    }
  }
}
