import {
  IntegrationJobAction,
  QueueName,
  connection,
  defaultWorkerOptions,
  type IntegrationJobData,
} from "@ahachat.ai/worker-config"
import { type Job, Worker } from "bullmq"
import { logger } from "../lib/log"
import { triggerAutomatedResponse } from "./handlers/automated-response"
import { receiveMessage } from "./handlers/received-message"
import type { OutgoingMessageEntity } from "@ahachat.ai/sdk"

const worker = new Worker(
  QueueName.INTEGRATION,
  async (job: Job<IntegrationJobData>) => {
    switch (job.data.type) {
      case IntegrationJobAction.RECEIVE_MESSAGE: {
        const { message } = await receiveMessage(job.data.data)

        if (message.content) {
          await triggerAutomatedResponse({
            message: message as OutgoingMessageEntity,
          })
        }
        return
      }
      default:
        console.log("Unhandled job:", job)
        return
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
