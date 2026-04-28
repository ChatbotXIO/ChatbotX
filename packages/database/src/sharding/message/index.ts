import { type DatabaseClient, db } from "../../client"
import {
  type DistributedLock,
  MessageRepository,
  type ShardManagerLike,
} from "../../repositories"
import { MessageShardConnectionManager } from "./connection-manager"
import { MessageShardRegistry } from "./registry"
import { ShardedMessageRepository } from "./repository"

export * from "./client"
export * from "./connection-manager"
export * from "./registry"
export * from "./schema"
export * from "./shard-schema"

const shardManagerCache = new WeakMap<DatabaseClient, ShardManagerLike>()

export async function createShardRepository(
  client: DatabaseClient = db,
  distributedLock?: DistributedLock,
) {
  const registry = new MessageShardRegistry(client)
  const shardCount = await registry.countShards()

  if (shardCount === 0) {
    return new MessageRepository(client)
  }

  const manager = new MessageShardConnectionManager(client, registry)
  shardManagerCache.set(client, manager)

  return new ShardedMessageRepository(
    manager,
    distributedLock,
  ) as unknown as MessageRepository
}
