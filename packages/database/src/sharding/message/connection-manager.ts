import type { Pool } from "pg"
import type { DatabaseClient } from "../../client"
import { logger } from "../../logger"
import {
  createReadShardPool,
  createShardPool,
  type ShardConfig,
  ShardNotActiveError,
  ShardUnreachableError,
  workspaceShardIndex,
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
  readClient: MessageShardDatabaseClient | null
  readPool: Pool | null
}

interface ActiveShardsCache {
  cachedAt: Date
  shards: ShardConfig[]
}

export class MessageShardConnectionManager {
  private readonly pools: Map<string, PoolEntry> = new Map()
  private shardingEnabled: boolean | null = null
  private activeShardsCache: ActiveShardsCache | null = null
  private lastEvictedAt: Date | null = null
  private readonly registry: MessageShardRegistry

  private static readonly MAX_POOLS = 10
  private static readonly ACTIVE_SHARD_TTL_MS = 30_000

  constructor(mainDb: DatabaseClient, registry?: MessageShardRegistry) {
    this.registry = registry ?? new MessageShardRegistry(mainDb)
  }

  async isShardingEnabled(): Promise<boolean> {
    if (this.shardingEnabled === null) {
      this.shardingEnabled = (await this.registry.countActiveShards()) > 0
    }
    return this.shardingEnabled
  }

  invalidateShardingCache(): void {
    this.shardingEnabled = null
    this.activeShardsCache = null
  }

  private async getActiveShardsForWrite(): Promise<ShardConfig[]> {
    if (this.activeShardsCache) {
      const age = Date.now() - this.activeShardsCache.cachedAt.getTime()
      if (age < MessageShardConnectionManager.ACTIVE_SHARD_TTL_MS) {
        return this.activeShardsCache.shards
      }
      this.activeShardsCache = null
    }

    const activeShards = await this.registry.listActive()
    this.activeShardsCache = { shards: activeShards, cachedAt: new Date() }
    return activeShards
  }

  async getShardForWrite(
    workspaceId: string,
  ): Promise<MessageShardDatabaseClient> {
    if (!(await this.isShardingEnabled())) {
      throw new ShardNotActiveError(
        "Message sharding is not enabled. No active shards configured.",
      )
    }

    const shards = await this.getActiveShardsForWrite()

    if (shards.length === 0) {
      throw new ShardNotActiveError()
    }

    const idx = workspaceShardIndex(workspaceId, shards.length)
    const shard = shards[idx]
    if (!shard) {
      throw new ShardNotActiveError()
    }

    return this.getShardClient(shard)
  }

  async getActiveShardForWrite(): Promise<MessageShardDatabaseClient> {
    if (!(await this.isShardingEnabled())) {
      throw new ShardNotActiveError(
        "Message sharding is not enabled. No active shards configured.",
      )
    }

    const shards = await this.getActiveShardsForWrite()
    if (shards.length === 0) {
      throw new ShardNotActiveError()
    }

    return this.getShardClient(shards[0])
  }

  invalidateActiveShardCache(): void {
    this.activeShardsCache = null
  }

  getShardsForTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<MessageShardTimeRangeInfo[]> {
    return this.registry.findShardsForTimeRange(startTime, endTime)
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

    const readPool = createReadShardPool(shard)
    let readClient: MessageShardDatabaseClient | null = null
    if (readPool) {
      try {
        await this.healthCheck(readPool, `${shard.id}:read`)
        readClient = createMessageShardClient(readPool)
      } catch (error) {
        logger.warn(
          { err: error, shardId: shard.id },
          "Read replica unhealthy, falling back to primary for reads",
        )
        await readPool.end().catch((_e) => undefined)
      }
    }

    const client = createMessageShardClient(pool)
    this.pools.set(shard.id, {
      pool,
      client,
      readPool: readClient ? readPool : null,
      readClient,
      lastUsed: new Date(),
    })

    return client
  }

  getShardClientForRead(
    shard: ShardConfig,
  ): Promise<MessageShardDatabaseClient> {
    const entry = this.pools.get(shard.id)
    if (entry?.readClient) {
      entry.lastUsed = new Date()
      return Promise.resolve(entry.readClient)
    }
    return this.getShardClient(shard)
  }

  private async healthCheck(pool: Pool, shardId: string): Promise<void> {
    try {
      await pool.query("SELECT 1")
    } catch (error) {
      await pool.end().catch((_e) => undefined)
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
          logger.error({ shardId, err: error }, "Error closing pool for shard")
        }),
      )
      if (entry.readPool) {
        closePromises.push(
          entry.readPool.end().catch((error) => {
            logger.error(
              { shardId, err: error },
              "Error closing read pool for shard",
            )
          }),
        )
      }
    }

    await Promise.all(closePromises)
    this.pools.clear()
    this.shardingEnabled = null
    this.activeShardsCache = null
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
      hasReadReplica: boolean
    }>
  } {
    const poolDetails = Array.from(this.pools.entries()).map(
      ([shardId, entry]) => ({
        shardId,
        lastUsed: entry.lastUsed,
        totalCount: entry.pool.totalCount,
        idleCount: entry.pool.idleCount,
        waitingCount: entry.pool.waitingCount,
        hasReadReplica: entry.readClient !== null,
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
        logger.error(
          { shardId, err: error },
          "Error closing evicted pool for shard",
        )
      })
      if (poolEntry.readPool) {
        poolEntry.readPool.end().catch((error) => {
          logger.error(
            { shardId, err: error },
            "Error closing evicted read pool for shard",
          )
        })
      }
      this.pools.delete(shardId)
      this.lastEvictedAt = new Date()
    }
  }
}
