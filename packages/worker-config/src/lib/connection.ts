import { default as IORedis, type RedisOptions } from "ioredis"
import RedisMock from "ioredis-mock"
import { keys } from "../keys"

let permanentRedis: IORedis | null = null
const env = keys()

export function getRedisConnection() {
  if (permanentRedis) {
    return permanentRedis
  }

  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
    reconnectOnError: (err) => {
      const targetError = "READONLY"
      if (err.message.includes(targetError)) {
        return true
      }
      return false
    },
  }

  permanentRedis =
    env.NEXT_PHASE === "phase-production-build"
      ? new RedisMock(env.REDIS_URL, options)
      : new IORedis(env.REDIS_URL, options)

  return permanentRedis
}

export const defaultJobOptions = {
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 5000,
  },
}

export const defaultWorkerOptions = {
  concurrency: 5,
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
}
