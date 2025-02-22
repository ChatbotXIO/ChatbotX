import scheduleBroadcast from "@/jobs/scheduler/broadcast"
import startFlow from "@/jobs/start-flow"
import { JOB_NAMES } from "@/scheduler/types"
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
    console.log(job)
    // if (job.name === JOB_NAMES.ScheduleBroadcast) {
    //   return scheduleBroadcast()
    // }
    //
    // if (job.name === JOB_NAMES.StartFlow) {
    //   const { flowId, contactId } = job.data
    //
    //   return startFlow(flowId, contactId)
    // }
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
)

export default flowWorker
