import { createRedisConnection } from "@chatbotx.io/redis"
import type { default as IORedis, RedisOptions } from "ioredis"
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
    // Module-scope consumers (event buses, queues) are evaluated while
    // `next build` collects page data with no Redis reachable; lazyConnect
    // keeps the build from dialing 127.0.0.1:6379 in an infinite retry loop.
    lazyConnect: env.NEXT_PHASE === "phase-production-build",
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

  permanentRedis = createRedisConnection(env.REDIS_URL, options)

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
  getJob: () => Promise.resolve(undefined),
  remove: () => Promise.resolve(0),
}
