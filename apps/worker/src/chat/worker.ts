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
import {
  changeMessageStateOnChannel,
  deleteMessageFromChannel,
  editMessageFromChannel,
  sendMessageToChannel,
  sendTypingToChannel,
} from "./handlers/send-message"
import { sendMessengerTemplateMessage } from "./handlers/send-messenger-template"
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
        case ChatJobAction.sendMessengerTemplateMessage:
          await sendMessengerTemplateMessage(job.data.data)
          return
        case ChatJobAction.sendTyping:
          await sendTypingToChannel(job.data.data)
          return
        case ChatJobAction.deleteChannelMessage:
          await deleteMessageFromChannel(job.data.data)
          return
        case ChatJobAction.editChannelMessage:
          await editMessageFromChannel(job.data.data)
          return
        case ChatJobAction.changeChannelMessageState:
          await changeMessageStateOnChannel(job.data.data)
          return
        case ChatJobAction.notifyExportResult:
          logger.warn(
            { jobId: job.id },
            "notifyExportResult job received but no handler is implemented",
          )
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

  let isShuttingDown = false
  async function shutdown() {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    try {
      await worker.close()
      process.exit(0)
    } catch (err) {
      logger.error(err, "[ChatWorker] Error during shutdown")
      process.exit(1)
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

startChatWorker()
