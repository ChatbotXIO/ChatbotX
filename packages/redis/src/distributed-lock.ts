import { Mutex } from "async-mutex"
import type Redis from "ioredis"
import {
  createRedlock,
  IoredisAdapter,
  LockAcquisitionError,
} from "redlock-universal"

const LOCK_ACQUISITION_ERROR_NAME = "LockAcquisitionError"
const LOCK_ACQUISITION_ERROR_CODE = "LOCK_ACQUISITION_FAILED"

type LockAcquisitionErrorLike = {
  name: string
  code: string
  key: string
}

const isLockAcquisitionErrorLike = (
  error: unknown,
): error is LockAcquisitionErrorLike =>
  error instanceof LockAcquisitionError ||
  (typeof error === "object" &&
    error !== null &&
    "name" in error &&
    "code" in error &&
    "key" in error &&
    error.name === LOCK_ACQUISITION_ERROR_NAME &&
    error.code === LOCK_ACQUISITION_ERROR_CODE)

// `redLock.using()` throws LockAcquisitionError when it cannot obtain the lock and lets
// fn's errors propagate unchanged. Pass `key` whenever fn may itself take a distributed
// lock — otherwise an inner lock's acquisition failure is indistinguishable from the
// outer one's.
export const isLockAcquisitionError = (error: unknown, key?: string): boolean =>
  isLockAcquisitionErrorLike(error) && (key === undefined || error.key === key)

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
