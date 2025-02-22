import IORedis from "ioredis"

export const connection = new IORedis({
  host: process.env.REDIS_HOST,
  maxRetriesPerRequest: null,
})

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
