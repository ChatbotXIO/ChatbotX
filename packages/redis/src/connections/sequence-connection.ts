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
      return await sequenceConnection
    }
    return mutexLock.runExclusive(async () => {
      if (sequenceConnection !== null && sequenceConnection !== undefined) {
        return sequenceConnection
      }
      return await sequenceConnections.create()
    })
  },

  async destroy(): Promise<void> {
    if (sequenceConnection) {
      await sequenceConnection.quit()
      sequenceConnection = null
    }
  },
}
