import { sql } from "drizzle-orm"
import type { DatabaseClient } from "../../client"
import type { ShardConfig } from "../shared"
// Schema models are now referenced directly in raw SQL queries

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
  sslMode?: string | null
  user: string
}

export class MessageShardRegistry {
  private readonly mainDb: DatabaseClient

  constructor(mainDb: DatabaseClient) {
    this.mainDb = mainDb
  }

  async countShards(): Promise<number> {
    const result = await this.mainDb.execute(
      sql`SELECT COUNT(*) as count FROM "MessageShard"`,
    )
    const rows = result.rows as Array<{ count: string }>
    return Number(rows[0]?.count ?? 0)
  }

  async listActive(): Promise<MessageShardRecord[]> {
    const result = await this.mainDb.execute(
      sql`SELECT * FROM "MessageShard" WHERE "isActive" = true`,
    )
    const rows = result.rows as Array<{
      id: number
      createdAt: Date
      updatedAt: Date
      name: string
      host: string
      port: number
      database: string
      user: string
      credentialRef: string | null
      isActive: boolean
      sslMode: string | null
    }>
    return rows.map(toShardRecord)
  }

  async findActiveForWrite(): Promise<MessageShardRecord | null> {
    const result = await this.mainDb.execute(
      sql`SELECT * FROM "MessageShard" WHERE "isActive" = true LIMIT 1`,
    )
    const rows = result.rows as Array<{
      id: number
      createdAt: Date
      updatedAt: Date
      name: string
      host: string
      port: number
      database: string
      user: string
      credentialRef: string | null
      isActive: boolean
      sslMode: string | null
    }>
    const row = rows[0]
    return row ? toShardRecord(row) : null
  }

  async findShardsForTimeRange(
    startTime: Date,
    endTime: Date,
  ): Promise<MessageShardTimeRangeInfo[]> {
    const result = await this.mainDb.execute(
      sql`
        SELECT
          str.id as "str_id",
          str."shardId",
          str."startTime",
          str."endTime",
          ms.id,
          ms."createdAt",
          ms."updatedAt",
          ms.name,
          ms.host,
          ms.port,
          ms.database,
          ms."user",
          ms."credentialRef",
          ms."isActive"
        FROM "ShardTimeRange" str
        INNER JOIN "MessageShard" ms ON ms.id = str."shardId"
        WHERE str."startTime" <= ${endTime}
          AND (str."endTime" IS NULL OR str."endTime" > ${startTime})
        ORDER BY str."startTime" DESC
      `,
    )

    const rows = result.rows as Array<{
      str_id: number
      shardId: number
      startTime: Date
      endTime: Date | null
      id: number
      createdAt: Date
      updatedAt: Date
      name: string
      host: string
      port: number
      database: string
      user: string
      credentialRef: string | null
      isActive: boolean
    }>

    return rows.map((row) => ({
      id: String(row.str_id),
      shardId: String(row.shardId),
      startTime: row.startTime,
      endTime: row.endTime,
      shard: {
        id: String(row.id),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        name: row.name,
        host: row.host,
        port: row.port,
        database: row.database,
        user: row.user,
        credentialRef: row.credentialRef,
        isActive: row.isActive,
      },
    }))
  }

  async register(
    input: RegisterMessageShardInput,
  ): Promise<MessageShardRecord> {
    const port = input.port ?? 5432
    const credentialRef = input.credentialRef ?? null
    const sslMode = input.sslMode ?? "disable"
    const isActive = input.isActive ?? false

    const result = await this.mainDb.execute(
      sql`INSERT INTO "MessageShard" (name, host, port, database, "user", "credentialRef", "sslMode", "isActive", "createdAt", "updatedAt") VALUES (${input.name}, ${input.host}, ${port}, ${input.database}, ${input.user}, ${credentialRef}, ${sslMode}, ${isActive}, now(), now()) RETURNING *`,
    )
    const rows = result.rows as Array<{
      id: number
      createdAt: Date
      updatedAt: Date
      name: string
      host: string
      port: number
      database: string
      user: string
      credentialRef: string | null
      isActive: boolean
      sslMode: string | null
    }>
    const row = rows[0]
    if (!row) {
      throw new Error("Failed to register message shard")
    }
    return toShardRecord(row)
  }

  async archive(shardId: string): Promise<void> {
    await this.mainDb.execute(
      sql`UPDATE "MessageShard" SET "isActive" = false, "updatedAt" = now() WHERE id = ${shardId}`,
    )
  }

  async setActive(shardId: string, isActive: boolean): Promise<void> {
    await this.mainDb.execute(
      sql`UPDATE "MessageShard" SET "isActive" = ${isActive}, "updatedAt" = now() WHERE id = ${shardId}`,
    )
  }
}

function toShardConfig(row: {
  id: number
  name: string
  host: string
  port: number
  database: string
  user: string
  credentialRef: string | null
  sslMode: string | null
}): ShardConfig {
  return {
    id: String(row.id),
    name: row.name,
    host: row.host,
    port: row.port,
    database: row.database,
    user: row.user,
    credentialRef: row.credentialRef,
    sslMode: row.sslMode,
  }
}

function toShardRecord(row: {
  id: number
  createdAt: Date
  updatedAt: Date
  name: string
  host: string
  port: number
  database: string
  user: string
  credentialRef: string | null
  isActive: boolean
  sslMode: string | null
}): MessageShardRecord {
  return {
    ...toShardConfig(row),
    isActive: row.isActive,
    credentialRef: row.credentialRef,
    sslMode: row.sslMode,
  }
}
