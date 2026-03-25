import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import { keys } from "../keys"
import { createRedisConnection } from "../redis-client"

let cacheInstance: Redis | null = null
const mutexLock = new Mutex()
const env = keys()

export const cacheConnections = {
  async create(): Promise<Redis> {
    return await createRedisConnection(env.REDIS_CACHE_URL ?? env.REDIS_URL)
  },

  async useExisting(): Promise<Redis> {
    if (cacheInstance) {
      return await cacheInstance
    }
    return mutexLock.runExclusive(async () => {
      if (cacheInstance !== null && cacheInstance !== undefined) {
        return cacheInstance
      }
      return await cacheConnections.create()
    })
  },

  async destroy(): Promise<void> {
    if (cacheInstance) {
      await cacheInstance.quit()
      cacheInstance = null
    }
  },
}
