import { drizzle } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"
import { attachmentModel, messageModel } from "./shard-schema"

const messageShardSchema = {
  messageModel,
  attachmentModel,
}

export type MessageShardDatabaseClient = ReturnType<
  typeof createMessageShardClient
>

export function createMessageShardClient(pool: Pool) {
  return drizzle({
    client: pool,
    schema: messageShardSchema,
    logger: process.env.NODE_ENV !== "production",
  })
}
