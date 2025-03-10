import {
  QueueName,
  connection,
  defaultWorkerOptions,
} from "@ahachat.ai/worker-config"
import { Worker } from "bullmq"
import { logger } from "../lib/log"
import {
  addMessageHandler,
  type AddMessageHandlerProps,
} from "./handlers/add-message.js"

const worker = new Worker(
  QueueName.CHAT,
  async (job) => {
    if (job.name === "add") {
      await addMessageHandler(job.data as AddMessageHandlerProps)
    }
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
