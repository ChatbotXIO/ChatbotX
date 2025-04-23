import {
  QueueName,
  connection,
  defaultWorkerOptions,
} from "@ahachat.ai/worker-config"
import { Worker } from "bullmq"
import { logger } from "../lib/log"

const worker = new Worker(
  QueueName.FLOW,
  async (job) => {
    const data = job.data
    console.log(data)
  },
  {
    connection,
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
