import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import { keys } from "../keys"
import { createRedisConnection } from "../redis-client"

let sequenceConnection: Redis | null = null
const mutexLock = new Mutex()
const env = keys()

export const sequenceConnections = {
  async create(): Promise<Redis> {
    return await createRedisConnection(env.REDIS_SEQUENCE_URL ?? env.REDIS_URL)
  },

  async useExisting(): Promise<Redis> {
    if (sequenceConnection) {
      return sequenceConnection
    }
    return await mutexLock.runExclusive(async () => {
      if (sequenceConnection) {
        return sequenceConnection
      }
      sequenceConnection = await sequenceConnections.create()
      return sequenceConnection
    })
  },

  async destroy(): Promise<void> {
    if (sequenceConnection) {
      await sequenceConnection.quit()
      sequenceConnection = null
    }
  },
}
