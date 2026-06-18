import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import { keys } from "../keys"
import { createRedisConnection } from "../redis-client"

let cacheInstance: Redis | null = null
const mutexLock = new Mutex()
const env = keys()

export const cacheConnections = {
  async create(): Promise<Redis> {
    return await createRedisConnection(env.REDIS_CACHE_URL ?? env.REDIS_URL, {
      // Fail commands immediately if Redis is down so callers can fall back fast.
      // BullMQ queue connections need null (retry forever); cache reads do not.
      maxRetriesPerRequest: 0,
      commandTimeout: 10_000, // 10 seconds max per command
      // enableOfflineQueue: false, // don't queue commands while disconnected
    })
  },

  async useExisting(): Promise<Redis> {
    if (cacheInstance) {
      return cacheInstance
    }
    return await mutexLock.runExclusive(async () => {
      if (cacheInstance) {
        return cacheInstance
      }
      cacheInstance = await cacheConnections.create()
      return cacheInstance
    })
  },

  async destroy(): Promise<void> {
    if (cacheInstance) {
      await cacheInstance.quit()
      cacheInstance = null
    }
  },
}
