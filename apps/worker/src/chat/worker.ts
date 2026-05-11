import { broadcastToWorkspaceParty } from "@chatbotx.io/business"
import type { RealtimeEventData } from "@chatbotx.io/partysocket-config"
import { SdkException } from "@chatbotx.io/sdk"
import {
  ChatJobAction,
  type ChatJobData,
  defaultWorkerOptions,
  getRedisConnection,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { sendChatMessage, sendFlowStep } from "./handlers/send-flow-step"
import { sendMessageToChannel } from "./handlers/send-message"
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
    queueNames.enum.chat,
    async (job: Job<ChatJobData>) => {
      switch (job.data.type) {
        case ChatJobAction.sendChannelMessage:
          await sendMessageToChannel(job.data.data)
          return
        case ChatJobAction.sendFlowMessage:
          await sendFlowStep(job.data.data)
          return
        case ChatJobAction.sendChatMessage:
          await sendChatMessage(job.data.data)
          return
        case ChatJobAction.sendWhatsappTemplateMessage:
          await sendWhatsappTemplateMessage(job.data.data)
          return
        case ChatJobAction.broadcastEvent:
          await broadcastToWorkspaceParty(
            job.data.data.workspaceId,
            job.data.data.event as RealtimeEventData,
          )
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
      logger.error(err, `Job ${job.id} has failed`)
    }
  })
}

startChatWorker()
