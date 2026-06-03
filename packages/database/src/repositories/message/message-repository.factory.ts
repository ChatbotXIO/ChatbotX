import { type DatabaseClient, db } from "../../client"
import { keys } from "../../keys"
import {
  type DistributedLock,
  type IMessageRepository,
  MessageRepository,
} from "./message-repository"

interface RepositoryCacheEntry {
  distributedLock?: DistributedLock
  promise: Promise<IMessageRepository>
}

export interface ShardManagerLike {
  invalidateShardingCache(): void
  shutdown(): Promise<void>
}

const repositoryCache = new WeakMap<DatabaseClient, RepositoryCacheEntry>()
const shardManagerCache = new WeakMap<DatabaseClient, ShardManagerLike>()

let shardModuleCache: {
  createShardRepository: typeof import("../../sharding/message").createShardRepository
} | null = null
let shardModuleExists: boolean | null = null

async function buildRepository(
  client: DatabaseClient,
  _distributedLock?: DistributedLock,
): Promise<IMessageRepository> {
  const env = keys()

  if (!env.ENABLE_MESSAGE_SHARDING) {
    return new MessageRepository(client)
  }

  try {
    if (shardModuleExists === false) {
      return new MessageRepository(client)
    }

    if (!shardModuleCache) {
      const module = await import("../../sharding/message")
      shardModuleCache = module
      shardModuleExists = true
    }

    const result = shardModuleCache.createShardRepository()
    if (result === null) {
      return new MessageRepository(client)
    }

    return result
  } catch {
    shardModuleExists = false
    return new MessageRepository(client)
  }
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
