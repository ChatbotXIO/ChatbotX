import { count } from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
import { keys } from "../../keys"
import { messageShardModel } from "../../schema"
import { ShardConnectionManager } from "../../shard"
import { MessageRepository as SingleDatabaseMessageRepository } from "./message-repository"
import type {
  DistributedLock,
  MessageRepository,
} from "./message-repository.interface"
import { ShardedMessageRepository } from "./sharded-message-repository"

interface RepositoryCacheEntry {
  distributedLock?: DistributedLock
  promise: Promise<MessageRepository>
}

const repositoryCache = new WeakMap<DatabaseClient, RepositoryCacheEntry>()
const shardManagerCache = new WeakMap<DatabaseClient, ShardConnectionManager>()

async function buildRepository(
  client: DatabaseClient,
  distributedLock?: DistributedLock,
): Promise<MessageRepository> {
  const env = keys()

  if (!env.ENABLE_MESSAGE_SHARDING) {
    return new SingleDatabaseMessageRepository(client)
  }

  const result = await client.select({ count: count() }).from(messageShardModel)

  const shardCount = Number(result[0]?.count ?? 0)

  if (shardCount === 0) {
    return new SingleDatabaseMessageRepository(client)
  }

  const manager = new ShardConnectionManager(client)
  shardManagerCache.set(client, manager)
  return new ShardedMessageRepository(manager, distributedLock)
}

export function createMessageRepository(
  client: DatabaseClient = db,
  distributedLock?: DistributedLock,
): Promise<MessageRepository> {
  const cached = repositoryCache.get(client)
  if (cached && cached.distributedLock === distributedLock) {
    return cached.promise
  }

  const promise = buildRepository(client, distributedLock)
  repositoryCache.set(client, { promise, distributedLock })
  return promise
}

export function getShardManager(
  client: DatabaseClient = db,
): ShardConnectionManager | null {
  return shardManagerCache.get(client) ?? null
}

export function invalidateRepositoryCache(client: DatabaseClient = db): void {
  repositoryCache.delete(client)
  const manager = shardManagerCache.get(client)
  if (manager) {
    manager.invalidateShardingCache()
  }
}

export async function shutdownShardConnections(
  client: DatabaseClient = db,
): Promise<void> {
  const manager = shardManagerCache.get(client)
  if (manager) {
    await manager.shutdown()
    shardManagerCache.delete(client)
  }
  repositoryCache.delete(client)
}
