import IORedis from "ioredis"

let connection: IORedis | null = null

export function getRedisConnection() {
  if (connection) return connection

  connection = new IORedis({
    host: process.env.REDIS_HOST,
    port: Number.parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
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
