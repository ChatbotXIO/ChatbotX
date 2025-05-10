import {
  ChatJobAction,
  QueueName,
  connection,
  defaultWorkerOptions,
  type ChatJobData,
} from "@ahachat.ai/worker-config"
import { Worker, type Job } from "bullmq"
import { logger } from "../lib/log"
import { sendMessageToExternal } from "./handlers/send-message"
import { SdkException } from "@ahachat.ai/sdk"
import { triggerMessage } from "./handlers/trigger-message"

const worker = new Worker(
  QueueName.CHAT,
  async (job: Job<ChatJobData>) => {
    switch (job.data.type) {
      case ChatJobAction.SEND_MESSAGE:
        await sendMessageToExternal(job.data)
        return
      case ChatJobAction.TRIGGER_MESSAGE:
        await triggerMessage(job.data)
        return
      default:
        throw new SdkException("ChatJobAction action is not defined")
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
