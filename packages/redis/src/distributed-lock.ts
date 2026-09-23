import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import {
  createRedlock,
  IoredisAdapter,
  LockAcquisitionError,
} from "redlock-universal"

// `redLock.using()` throws `LockAcquisitionError` when it cannot obtain the
// lock, and lets any error thrown by `fn` propagate unchanged (redlock-universal
// does not wrap `fn`'s rejection). Callers that degrade to unlocked processing
// on a lock failure must check this before falling back, or they will also
// treat a `fn` failure as "lock unavailable" and rerun `fn` a second time.
export const isLockAcquisitionError = (error: unknown): boolean =>
  error instanceof LockAcquisitionError

export const distributedLockFactory = (
  createRedisConnection: () => Promise<Redis>,
) => {
  const lockMutex = new Mutex()
  let redisAdapter: IoredisAdapter | undefined

  const getOrCreateRedisAdapter = async (): Promise<IoredisAdapter> =>
    await lockMutex.runExclusive(async () => {
      if (redisAdapter !== undefined && redisAdapter !== null) {
        return await Promise.resolve(redisAdapter)
      }

      const redisClient = await createRedisConnection()
      redisAdapter = new IoredisAdapter(redisClient)
      return redisAdapter
    })

  return {
    runExclusive: async <T>({
      key,
      timeoutInSeconds,
      retryTimeoutInSeconds,
      fn,
    }: RunExclusiveParams<T>): Promise<T> => {
      const timeout = timeoutInSeconds * 1000
      const retryTimeout = (retryTimeoutInSeconds ?? timeoutInSeconds) * 1000
      const adapter = await getOrCreateRedisAdapter()
      const redLock = createRedlock({
        adapters: [adapter],
        key,
        ttl: timeout,
        retryAttempts: Math.ceil(retryTimeout / 200),
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
  retryTimeoutInSeconds?: number
  fn: () => Promise<T>
}
