import {
  ChatJobAction,
  QueueName,
  getRedisConnection,
  defaultWorkerOptions,
  type ChatJobData,
} from "@aha.chat/worker-config"
import { Worker, type Job } from "bullmq"
import { logger } from "../lib/logger"
import { sendMessageToExternal } from "./handlers/send-message"
import { SdkException } from "@aha.chat/sdk"
import { sendFlowStep } from "./handlers/send-flow-step"

const worker = new Worker(
  QueueName.CHAT,
  async (job: Job<ChatJobData>) => {
    switch (job.data.type) {
      case ChatJobAction.SEND_MESSAGE:
        await sendMessageToExternal(job.data)
        return
      case ChatJobAction.SEND_FLOW_STEP:
        await sendFlowStep(job.data.data)
        return
      default:
        throw new SdkException("ChatJobAction action is not defined")
    }
  },
  {
    connection: getRedisConnection(),
    ...defaultWorkerOptions,
  },
)

worker.on("failed", (job, err) => {
  if (job) {
    logger.error(`${job.id} has failed`, err)
  }
})
