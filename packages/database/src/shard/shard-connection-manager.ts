import { and, count, desc, eq, gt, isNull, lte, or } from "drizzle-orm"
import type { Pool } from "pg"
import type { DatabaseClient } from "../client"
import { logger } from "../logger"
import { messageShardModel, shardTimeRangeModel } from "../schema"
import { ShardNotActiveError, ShardUnreachableError } from "./errors"
import {
  createShardClient,
  createShardPool,
  type ShardConfig,
  type ShardDatabaseClient,
} from "./shard-client"

export interface ShardInfo extends ShardConfig {
  isActive: boolean | null
}

export interface ShardTimeRangeInfo {
  endTime: Date | null
  id: string
  shard: ShardInfo
  shardId: string
  startTime: Date
}

interface PoolEntry {
  client: ShardDatabaseClient
  lastUsed: Date
  pool: Pool
}

interface ActiveShardCache {
  cachedAt: Date
  shard: ShardConfig
}

export class ShardConnectionManager {
  private readonly pools: Map<string, PoolEntry> = new Map()
  private shardingEnabled: boolean | null = null
  private activeShardCache: ActiveShardCache | null = null
  private lastEvictedAt: Date | null = null
  private readonly mainDb: DatabaseClient

  private static readonly MAX_POOLS = 10
  private static readonly POOL_SIZE_PER_SHARD = 5
  private static readonly ACTIVE_SHARD_TTL_MS = 30_000

  constructor(mainDb: DatabaseClient) {
    this.mainDb = mainDb
  }

  async isShardingEnabled(): Promise<boolean> {
    if (this.shardingEnabled === null) {
      const result = await this.mainDb
        .select({ count: count() })
        .from(messageShardModel)
      this.shardingEnabled = Number(result[0]?.count ?? 0) > 0
    }
    return this.shardingEnabled
  }

  invalidateShardingCache(): void {
    this.shardingEnabled = null
  }

  async getActiveShardForWrite(): Promise<ShardDatabaseClient> {
    if (!(await this.isShardingEnabled())) {
      throw new ShardNotActiveError(
        "Message sharding is not enabled. No shards configured.",
      )
    }

    if (this.activeShardCache) {
      const age = Date.now() - this.activeShardCache.cachedAt.getTime()
      if (age < ShardConnectionManager.ACTIVE_SHARD_TTL_MS) {
        return this.getShardClient(this.activeShardCache.shard)
      }
      this.activeShardCache = null
    }

    const activeShard = await this.mainDb.query.messageShardModel.findFirst({
      where: {
        isActive: true,
      },
    })

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
  ): Promise<ShardTimeRangeInfo[]> {
    const timeRanges = await this.mainDb
      .select()
      .from(shardTimeRangeModel)
      .innerJoin(
        messageShardModel,
        eq(messageShardModel.id, shardTimeRangeModel.shardId),
      )
      .where(
        and(
          lte(shardTimeRangeModel.startTime, endTime),
          or(
            isNull(shardTimeRangeModel.endTime),
            gt(shardTimeRangeModel.endTime, startTime),
          ),
        ),
      )
      .orderBy(desc(shardTimeRangeModel.startTime))

    return this.mapTimeRangeRows(timeRanges)
  }

  private mapTimeRangeRows(
    timeRanges: {
      ShardTimeRange: typeof shardTimeRangeModel.$inferSelect
      MessageShard: typeof messageShardModel.$inferSelect
    }[],
  ): ShardTimeRangeInfo[] {
    return timeRanges.map((row) => ({
      id: row.ShardTimeRange.id,
      shardId: row.ShardTimeRange.shardId,
      startTime: row.ShardTimeRange.startTime,
      endTime: row.ShardTimeRange.endTime,
      shard: {
        id: row.MessageShard.id,
        name: row.MessageShard.name,
        host: row.MessageShard.host,
        port: row.MessageShard.port,
        database: row.MessageShard.database,
        user: row.MessageShard.user,
        isActive: row.MessageShard.isActive,
      },
    }))
  }

  async getShardClient(shard: ShardConfig): Promise<ShardDatabaseClient> {
    const existing = this.pools.get(shard.id)
    if (existing) {
      existing.lastUsed = new Date()
      return existing.client
    }

    if (this.pools.size >= ShardConnectionManager.MAX_POOLS) {
      this.evictLeastRecentlyUsed()
    }

    const pool = createShardPool(shard)

    await this.healthCheck(pool, shard.id)

    const client = createShardClient(pool)

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
        // Ignore close errors during health check failure
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
    poolsPerShard: number
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
      maxPools: ShardConnectionManager.MAX_POOLS,
      poolsPerShard: ShardConnectionManager.POOL_SIZE_PER_SHARD,
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
