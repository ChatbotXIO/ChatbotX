import { defineRelations } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import type { Pool } from "pg"
import { attachmentModel, messageModel } from "./shard-schema"

const messageShardSchema = {
  messageModel,
  attachmentModel,
}

const messageShardRelations = defineRelations(messageShardSchema)

export type MessageShardDatabaseClient = ReturnType<
  typeof createMessageShardClient
>

export function createMessageShardClient(pool: Pool) {
  return drizzle({
    client: pool,
    relations: messageShardRelations,
    logger: process.env.NODE_ENV !== "production",
  })
}
