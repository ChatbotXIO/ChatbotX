import { default as IORedis, type RedisOptions } from "ioredis"
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

  permanentRedis = new IORedis(env.REDIS_URL, options)

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

// Queue is required Redis connection, so we need to provide a fake queue for the production build
export const fakeQueue = {
  add: () => Promise.resolve(""),
  addBulk: () => Promise.resolve(""),
}
