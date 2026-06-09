import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import { keys } from "../keys"
import { createRedisConnection } from "../redis-client"

let queueConnection: Redis | null = null
const mutexLock = new Mutex()
const env = keys()

export const queueConnections = {
  async create(): Promise<Redis> {
    return await createRedisConnection(env.REDIS_QUEUE_URL ?? env.REDIS_URL)
  },

  async useExisting(): Promise<Redis> {
    if (queueConnection) {
      return queueConnection
    }
    return await mutexLock.runExclusive(async () => {
      if (queueConnection) {
        return queueConnection
      }
      queueConnection = await queueConnections.create()
      return queueConnection
    })
  },

  async destroy(): Promise<void> {
    if (queueConnection) {
      await queueConnection.quit()
      queueConnection = null
    }
  },
}
