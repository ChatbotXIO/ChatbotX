import { type DatabaseClient, db } from "../../client"
import { createShardRepository } from "../../sharding/message"
import type { DistributedLock, IMessageRepository } from "./message-repository"

export interface ShardManagerLike {
  invalidateShardingCache(): void
  shutdown(): Promise<void>
}

interface RepositoryCacheEntry {
  distributedLock?: DistributedLock
  promise: Promise<IMessageRepository>
}

const repositoryCache = new WeakMap<DatabaseClient, RepositoryCacheEntry>()
const shardManagerCache = new WeakMap<DatabaseClient, ShardManagerLike>()

async function buildRepository(
  client: DatabaseClient,
  distributedLock?: DistributedLock,
): Promise<IMessageRepository> {
  const result = await createShardRepository(client, distributedLock)
  shardManagerCache.set(client, result.manager)
  return result.repository
}

export function createMessageRepository(
  client: DatabaseClient = db,
  distributedLock?: DistributedLock,
): Promise<IMessageRepository> {
  const cached = repositoryCache.get(client)
  if (cached && cached.distributedLock === distributedLock) {
    return cached.promise
  }

  const promise = buildRepository(client, distributedLock)
  promise.catch(() => repositoryCache.delete(client))
  repositoryCache.set(client, { promise, distributedLock })
  return promise
}

export function getShardManager(
  client: DatabaseClient = db,
): ShardManagerLike | null {
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
