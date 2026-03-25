import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import { createRedlock, IoredisAdapter } from "redlock-universal"

export const distributedLockFactory = (
  createRedisConnection: () => Promise<Redis>,
) => {
  const lockMutex = new Mutex()
  let redisAdapter: IoredisAdapter | undefined

  const getOrCreateRedisAdapter = async (): Promise<IoredisAdapter> => {
    return await lockMutex.runExclusive(async () => {
      if (redisAdapter !== undefined && redisAdapter !== null) {
        return await Promise.resolve(redisAdapter)
      }

      const redisClient = await createRedisConnection()
      redisAdapter = new IoredisAdapter(redisClient)
      return redisAdapter
    })
  }

  return {
    runExclusive: async <T>({
      key,
      timeoutInSeconds,
      fn,
    }: RunExclusiveParams<T>): Promise<T> => {
      const timeout = timeoutInSeconds * 1000
      const adapter = await getOrCreateRedisAdapter()
      const redLock = createRedlock({
        adapters: [adapter],
        key,
        ttl: timeout,
        retryAttempts: Math.ceil(timeout / 200),
        retryDelay: 200,
        clockDriftFactor: 0.01,
      })

      return redLock.using(async () => await fn())
    },
    destroy: async (): Promise<void> => {
      if (redisAdapter) {
        await redisAdapter.disconnect()
        redisAdapter = undefined
      }
    },
  }
}

type RunExclusiveParams<T> = {
  key: string
  timeoutInSeconds: number
  fn: () => Promise<T>
}
