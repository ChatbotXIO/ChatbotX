import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { keys } from "../keys"
import { attachmentModel, messageModel } from "./schema"

const shardSchema = {
  messageModel,
  attachmentModel,
}

export type ShardDatabaseClient = ReturnType<typeof createShardClient>

export interface ShardConfig {
  database: string
  host: string
  id: string
  name: string
  port: number | null
  user: string
}

export function createShardPool(shard: ShardConfig): Pool {
  const env = keys()

  return new Pool({
    host: shard.host,
    port: shard.port ?? 5432,
    database: shard.database,
    user: shard.user,
    password: env.MESSAGE_SHARDS_PASSWORD,
    ssl: env.MESSAGE_SHARDS_SSL ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5000,
  })
}

export function createShardClient(pool: Pool) {
  return drizzle({
    client: pool,
    schema: shardSchema,
  })
}
