import { and, asc, count, eq, gte, isNull, lte, or } from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import { logger } from "../../logger"
import { type ShardConfig, workspaceShardIndex } from "../shared"
import { messageShardModel, type SslMode } from "./schema/shard"
import { messageShardTimeRangeModel } from "./schema/time-range"

export interface MessageShardRecord extends ShardConfig {
  credentialRef: string | null
  isActive: boolean | null
  sslMode: string | null
}

export interface MessageShardInfo extends ShardConfig {
  isActive: boolean | null
}

export interface MessageShardTimeRangeInfo {
  endTime: Date | null
  id: string
  shard: MessageShardInfo
  shardId: string
  startTime: Date
}

export interface RegisterMessageShardInput {
  credentialRef?: string | null
  database: string
  host: string
  isActive?: boolean
  name: string
  port?: number | null
  readHost?: string | null
  readPort?: number | null
  shardKey?: number | null
  sslMode?: string | null
  user: string
}

export class MessageShardRegistry {
  private readonly mainDb: DatabaseClient

  constructor(mainDb: DatabaseClient) {
    this.mainDb = mainDb
  }

  async countShards(): Promise<number> {
    const [row] = await this.mainDb
      .select({ count: count() })
      .from(messageShardModel)
    return Number(row?.count ?? 0)
  }

  async countActiveShards(): Promise<number> {
    const [row] = await this.mainDb
      .select({ count: count() })
      .from(messageShardModel)
      .where(eq(messageShardModel.isActive, true))
    return Number(row?.count ?? 0)
  }

  async listActive(): Promise<MessageShardRecord[]> {
    const rows = await this.mainDb
      .select()
      .from(messageShardModel)
      .where(eq(messageShardModel.isActive, true))
      .orderBy(asc(messageShardModel.createdAt))
    return rows.map(toShardRecord)
  }

  async listAll(): Promise<MessageShardRecord[]> {
    const rows = await this.mainDb
      .select()
      .from(messageShardModel)
      .orderBy(asc(messageShardModel.createdAt))
    return rows.map(toShardRecord)
  }

  async findShardForWrite(
    workspaceId: string,
  ): Promise<MessageShardRecord | null> {
    const active = await this.listActive()
    if (active.length === 0) {
      return null
    }
    return active[workspaceShardIndex(workspaceId, active.length)] ?? null
  }

  async findActiveForWrite(): Promise<MessageShardRecord | null> {
    const active = await this.listActive()
    if (active.length === 0) {
      return null
    }
    return active[0] ?? null
  }

  async findShardsForTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<MessageShardTimeRangeInfo[]> {
    const rows = await this.mainDb
      .select({
        timeRangeId: messageShardTimeRangeModel.id,
        shardId: messageShardTimeRangeModel.shardId,
        startTime: messageShardTimeRangeModel.startTime,
        endTime: messageShardTimeRangeModel.endTime,
        shardDbId: messageShardModel.id,
        shardName: messageShardModel.name,
        shardHost: messageShardModel.host,
        shardPort: messageShardModel.port,
        shardDatabase: messageShardModel.database,
        shardUser: messageShardModel.user,
        shardCredentialRef: messageShardModel.credentialRef,
        shardIsActive: messageShardModel.isActive,
        shardSslMode: messageShardModel.sslMode,
        shardKey: messageShardModel.shardKey,
        readHost: messageShardModel.readHost,
        readPort: messageShardModel.readPort,
      })
      .from(messageShardTimeRangeModel)
      .innerJoin(
        messageShardModel,
        eq(messageShardModel.id, messageShardTimeRangeModel.shardId),
      )
      .where(
        and(
          lte(messageShardTimeRangeModel.startTime, endTime),
          or(
            isNull(messageShardTimeRangeModel.endTime),
            gte(messageShardTimeRangeModel.endTime, startTime),
          ),
        ),
      )
      .orderBy(asc(messageShardTimeRangeModel.startTime))

    return rows.map((row) => ({
      id: row.timeRangeId,
      shardId: row.shardId,
      startTime: row.startTime,
      endTime: row.endTime,
      shard: {
        id: row.shardDbId,
        name: row.shardName,
        host: row.shardHost,
        port: row.shardPort,
        database: row.shardDatabase,
        user: row.shardUser,
        credentialRef: row.shardCredentialRef,
        isActive: row.shardIsActive,
        sslMode: row.shardSslMode,
        shardKey: row.shardKey,
        readHost: row.readHost,
        readPort: row.readPort,
      },
    }))
  }

  async register(
    input: RegisterMessageShardInput,
  ): Promise<MessageShardRecord> {
    const [row] = await this.mainDb
      .insert(messageShardModel)
      .values({
        name: input.name,
        host: input.host,
        port: input.port ?? 5432,
        database: input.database,
        user: input.user,
        credentialRef: input.credentialRef ?? null,
        sslMode: (input.sslMode ?? "disable") as SslMode,
        isActive: input.isActive ?? false,
        shardKey: input.shardKey ?? null,
        readHost: input.readHost ?? null,
        readPort: input.readPort ?? null,
      })
      .returning()
    if (!row) {
      throw new Error("Failed to register message shard")
    }
    return toShardRecord(row)
  }

  async archive(shardId: string): Promise<void> {
    await this.mainDb
      .update(messageShardModel)
      .set({ isActive: false })
      .where(eq(messageShardModel.id, shardId))
    await this.closeOpenTimeRanges(shardId)
  }

  async setActive(shardId: string, isActive: boolean): Promise<void> {
    await this.mainDb
      .update(messageShardModel)
      .set({ isActive })
      .where(eq(messageShardModel.id, shardId))

    if (isActive) {
      await this.ensureOpenTimeRange(shardId)
    } else {
      await this.closeOpenTimeRanges(shardId)
    }
  }

  async ensureOpenTimeRange(shardId: string): Promise<void> {
    const existing = await this.mainDb
      .select({ id: messageShardTimeRangeModel.id })
      .from(messageShardTimeRangeModel)
      .where(
        and(
          eq(messageShardTimeRangeModel.shardId, shardId),
          isNull(messageShardTimeRangeModel.endTime),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      return
    }

    try {
      await this.mainDb.insert(messageShardTimeRangeModel).values({
        shardId,
        startTime: new Date(),
      })
    } catch (error) {
      logger.warn(
        { err: error, shardId },
        "Failed to create open time range for shard (may conflict with existing range)",
      )
    }
  }

  private async closeOpenTimeRanges(shardId: string): Promise<void> {
    await this.mainDb
      .update(messageShardTimeRangeModel)
      .set({ endTime: new Date() })
      .where(
        and(
          eq(messageShardTimeRangeModel.shardId, shardId),
          isNull(messageShardTimeRangeModel.endTime),
        ),
      )
  }
}

function toShardConfig(
  row: typeof messageShardModel.$inferSelect,
): ShardConfig {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    database: row.database,
    user: row.user,
    credentialRef: row.credentialRef,
    sslMode: row.sslMode,
    shardKey: row.shardKey,
    readHost: row.readHost,
    readPort: row.readPort,
  }
}

function toShardRecord(
  row: typeof messageShardModel.$inferSelect,
): MessageShardRecord {
  return {
    ...toShardConfig(row),
    isActive: row.isActive,
    credentialRef: row.credentialRef,
    sslMode: row.sslMode,
  }
}
