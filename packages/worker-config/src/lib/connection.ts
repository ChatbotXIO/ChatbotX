import IORedis from "ioredis"
import { keys } from "../keys"

let connection: IORedis | null = null
const env = keys()

export function getRedisConnection() {
  if (connection) {
    return connection
  }

  connection = new IORedis(env.REDIS_URL, {
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
  })

  return connection
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
