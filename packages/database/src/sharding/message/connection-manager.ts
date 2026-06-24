import type { Pool } from "pg"
import type { DatabaseClient } from "../../client"
import { logger } from "../../logger"
import {
  createReadShardPool,
  createShardPool,
  envInt,
  isConnectionError,
  type ShardConfig,
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
  readFailedAt: Date | null
  readPool: Pool | null
  readRetryPromise: Promise<void> | null
}

interface ActiveShardsCache {
  cachedAt: Date
  shards: ShardConfig[]
}

interface ShardCountCache {
  cachedAt: Date
  count: number
}

const READ_REPLICAS_ENABLED: boolean = false

interface MessageShardConnectionManagerOptions {
  readReplicasEnabled?: boolean
}

export class MessageShardConnectionManager {
  // Sentinel id for the main DB when no external shards are configured.
  // getShardClient / withShardClientForRead bypass pool management for this id
  // and return the main DB client directly.
  static readonly MAIN_DB_SHARD_ID = "__main_db__"

  private readonly pools: Map<string, PoolEntry> = new Map()
  private activeShardsCache: ActiveShardsCache | null = null
  private shardCountCache: ShardCountCache | null = null
  private lastEvictedAt: Date | null = null
  private readonly registry: MessageShardRegistry
  private readonly readReplicaRetryTtlMs: number
  private readonly readReplicasEnabled: boolean
  // Main DB cast to MessageShardDatabaseClient. Safe: ShardedMessageRepository
  // only queries messageModel + attachmentModel, which main DB now shares.
  private readonly mainDbShardClient: MessageShardDatabaseClient
  // Parsed from DATABASE_URL so registered archive shards pointing to the
  // same host/port/database bypass pool creation and reuse mainDbShardClient.
  private static readonly MAX_POOLS = 10
  private static readonly ACTIVE_SHARD_TTL_MS = 30_000

  constructor(
    mainDb: DatabaseClient,
    registry?: MessageShardRegistry,
    options: MessageShardConnectionManagerOptions = {},
  ) {
    this.registry = registry ?? new MessageShardRegistry(mainDb)
    this.mainDbShardClient = mainDb as unknown as MessageShardDatabaseClient
    this.readReplicaRetryTtlMs = envInt(
      "SHARD_READ_REPLICA_RETRY_TTL_MS",
      60_000,
    )
    this.readReplicasEnabled =
      options.readReplicasEnabled ?? READ_REPLICAS_ENABLED
  }

  private isMainDbShard(shard: ShardConfig): boolean {
    return shard.isMain === true
  }

  private getMainDbShardInfo(): MessageShardTimeRangeInfo {
    const shard = {
      id: MessageShardConnectionManager.MAIN_DB_SHARD_ID,
      name: "main",
      host: "",
      port: 5432,
      database: "",
      user: "",
      credentialRef: null,
      isActive: true,
      sslMode: null,
      shardKey: null,
      readHost: null,
      readPort: null,
    }
    return {
      id: MessageShardConnectionManager.MAIN_DB_SHARD_ID,
      shardId: MessageShardConnectionManager.MAIN_DB_SHARD_ID,
      startTime: new Date(0),
      endTime: null,
      shard,
    }
  }

  async isShardingEnabled(): Promise<boolean> {
    return (await this.registry.countActiveShards()) > 0
  }

  invalidateShardingCache(): void {
    this.activeShardsCache = null
    this.shardCountCache = null
  }

  private async getCachedShardCount(): Promise<number> {
    if (this.shardCountCache) {
      const age = Date.now() - this.shardCountCache.cachedAt.getTime()
      if (age < MessageShardConnectionManager.ACTIVE_SHARD_TTL_MS) {
        return this.shardCountCache.count
      }
    }
    const count = await this.registry.countShards()
    this.shardCountCache = { count, cachedAt: new Date() }
    return count
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
    const shards = await this.getActiveShardsForWrite()
    if (shards.length === 0) {
      return this.mainDbShardClient
    }
    const idx = workspaceShardIndex(workspaceId, shards.length)
    return this.getShardClient(shards[idx] ?? shards[0])
  }

  async getActiveShardForWrite(): Promise<MessageShardDatabaseClient> {
    const shards = await this.getActiveShardsForWrite()
    if (shards.length === 0) {
      return this.mainDbShardClient
    }
    return this.getShardClient(shards[0])
  }

  invalidateActiveShardCache(): void {
    this.activeShardsCache = null
    this.shardCountCache = null
  }

  async getShardsForTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<MessageShardTimeRangeInfo[]> {
    const shards = await this.registry.findShardsForTimeRange(
      startTime,
      endTime,
    )
    if (shards.length > 0) {
      return shards
    }
    // Fall back to main DB only when the MessageShard table has no records at all
    // (virgin state — sharding has never been configured).
    // Any record in MessageShard (even isMain=true, isActive=false after --init)
    // means sharding setup has started; falling back to main DB at that point
    // would silently read from the wrong location.
    const totalShards = await this.getCachedShardCount()
    return totalShards === 0 ? [this.getMainDbShardInfo()] : []
  }

  /**
   * The shard a workspace's writes land in, expressed as a time-range info that
   * spans ALL time. Writes route by workspace hash (getShardForWrite) and keep
   * the message's original createdAt, so historical/back-dated messages live in
   * this shard even though its registered time-range starts at activation. Reads
   * that select shards purely by time would miss them — callers union this shard
   * into the read set to guarantee the workspace's data is always reachable.
   */
  async getWriteShardInfo(
    workspaceId: string,
  ): Promise<MessageShardTimeRangeInfo | null> {
    const record = await this.registry.findShardForWrite(workspaceId)
    if (!record) {
      return this.getMainDbShardInfo()
    }
    return {
      id: `write:${record.id}`,
      shardId: record.id,
      startTime: new Date(0),
      endTime: null,
      shard: record,
    }
  }

  async getShardClient(
    shard: ShardConfig,
  ): Promise<MessageShardDatabaseClient> {
    if (
      shard.id === MessageShardConnectionManager.MAIN_DB_SHARD_ID ||
      this.isMainDbShard(shard)
    ) {
      return this.mainDbShardClient
    }
    return (await this.ensureEntry(shard)).client
  }

  private async ensureEntry(shard: ShardConfig): Promise<PoolEntry> {
    const existing = this.pools.get(shard.id)
    if (existing) {
      existing.lastUsed = new Date()
      return existing
    }

    if (this.pools.size >= MessageShardConnectionManager.MAX_POOLS) {
      this.evictLeastRecentlyUsed()
    }

    const pool = createShardPool(shard)
    await this.healthCheck(pool, shard.id)

    const readPool = this.readReplicasEnabled
      ? createReadShardPool(shard)
      : null
    let readClient: MessageShardDatabaseClient | null = null
    let readFailedAt: Date | null = null
    if (readPool) {
      try {
        await this.healthCheck(readPool, `${shard.id}:read`)
        readClient = createMessageShardClient(readPool)
      } catch (error) {
        logger.warn(
          { err: error, shardId: shard.id },
          "Read replica unhealthy, falling back to primary for reads",
        )
        readFailedAt = new Date()
        await readPool.end().catch((_e) => undefined)
      }
    }

    const entry: PoolEntry = {
      pool,
      client: createMessageShardClient(pool),
      readPool: readClient ? readPool : null,
      readClient,
      readFailedAt,
      readRetryPromise: null,
      lastUsed: new Date(),
    }
    this.pools.set(shard.id, entry)
    return entry
  }

  async withShardClientForRead<T>(
    shard: ShardConfig,
    fn: (client: MessageShardDatabaseClient) => Promise<T>,
  ): Promise<T> {
    if (
      shard.id === MessageShardConnectionManager.MAIN_DB_SHARD_ID ||
      this.isMainDbShard(shard)
    ) {
      return fn(this.mainDbShardClient)
    }

    const entry = await this.ensureEntry(shard)

    if (!this.readReplicasEnabled) {
      return fn(entry.client)
    }

    if (!entry.readClient && this.shouldRetryReadReplica(shard, entry)) {
      this.scheduleReadReplicaRetry(shard, entry)
    }

    const readClient = entry.readClient
    if (!readClient) {
      return fn(entry.client)
    }

    try {
      return await fn(readClient)
    } catch (error) {
      if (!isConnectionError(error)) {
        throw error
      }
      logger.warn(
        { err: error, shardId: shard.id },
        "Read replica query failed with connection error, retrying on primary",
      )
      this.markReadReplicaUnhealthy(shard.id)
      const retryEntry =
        this.pools.get(shard.id) === entry
          ? entry
          : await this.ensureEntry(shard)
      return fn(retryEntry.client)
    }
  }

  markReadReplicaUnhealthy(shardId: string): void {
    const entry = this.pools.get(shardId)
    if (!entry?.readClient) {
      return
    }
    const readPool = entry.readPool
    entry.readClient = null
    entry.readPool = null
    entry.readFailedAt = new Date()
    readPool?.end().catch((_e) => undefined)
  }

  private shouldRetryReadReplica(
    shard: ShardConfig,
    entry: PoolEntry,
  ): boolean {
    if (!(this.readReplicasEnabled && shard.readHost) || entry.readClient) {
      return false
    }

    if (!entry.readFailedAt) {
      return true
    }

    const elapsedMs = Date.now() - entry.readFailedAt.getTime()
    return elapsedMs >= this.readReplicaRetryTtlMs
  }

  private scheduleReadReplicaRetry(shard: ShardConfig, entry: PoolEntry): void {
    if (entry.readRetryPromise) {
      return
    }

    // .catch is mandatory: nothing awaits this promise. connectReadReplica
    // catches expected failures internally, but this remains the final guard
    // against future unexpected throws becoming unhandled rejections.
    entry.readRetryPromise = this.connectReadReplica(shard, entry)
      .catch((error) => {
        logger.warn(
          { err: error, shardId: shard.id },
          "Unexpected error during read replica reconnect",
        )
      })
      .finally(() => {
        entry.readRetryPromise = null
      })
  }

  private async connectReadReplica(
    shard: ShardConfig,
    entry: PoolEntry,
  ): Promise<void> {
    let readPool: Pool | null = null
    try {
      if (!this.readReplicasEnabled) {
        return
      }
      readPool = createReadShardPool(shard)
      if (!readPool) {
        return
      }
      await this.healthCheck(readPool, `${shard.id}:read`)
      if (this.pools.get(shard.id) !== entry) {
        await readPool.end().catch((_e) => undefined)
        return
      }
      entry.readPool = readPool
      entry.readClient = createMessageShardClient(readPool)
      entry.readFailedAt = null
      logger.info({ shardId: shard.id }, "Read replica recovered")
    } catch (error) {
      entry.readFailedAt = new Date()
      logger.warn(
        { err: error, shardId: shard.id },
        "Read replica still unhealthy, continuing primary fallback for reads",
      )
      await readPool?.end().catch((_e) => undefined)
    }
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
