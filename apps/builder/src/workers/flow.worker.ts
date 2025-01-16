import { Queue, Worker } from "bullmq"
import IORedis from "ioredis"
import { QueueName } from "./schema"

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  maxRetriesPerRequest: null,
})

// Create a new connection in every instance
export const flowQueue = new Queue(QueueName.Flow, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
})

const flowWorker = new Worker(
  QueueName.Flow,
  async (job) => {
    // Will print { foo: 'bar'} for the first job
    // and { qux: 'baz' } for the second.
    console.log(job)
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
)

export default flowWorker
