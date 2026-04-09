import { SdkException } from "@chatbotx.io/sdk"
import {
  type ChatJobData,
  chatJobActions,
  defaultWorkerOptions,
  getRedisConnection,
  queueName,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { sendChatMessage, sendFlowStep } from "./handlers/send-flow-step"
import { sendMessageToExternal } from "./handlers/send-message"
import { sendWhatsappTemplateMessage } from "./handlers/send-whatsapp-template"

async function startChatWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Chat worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap chat worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueName.chat,
    async (job: Job<ChatJobData>) => {
      switch (job.data.type) {
        case chatJobActions.enum.sendExternalMessage:
          await sendMessageToExternal(job.data.data)
          return
        case chatJobActions.enum.sendFlowMessage:
          await sendFlowStep(job.data.data)
          return
        case chatJobActions.enum.sendChatMessage:
          await sendChatMessage(job.data.data)
          return
        case chatJobActions.enum.sendWhatsappTemplateMessage:
          await sendWhatsappTemplateMessage(job.data.data)
          return
        default:
          throw new SdkException("Chat Queue action is not defined")
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error(err, `Job ${job.id} has failed`)
    }
  })
}

startChatWorker()
