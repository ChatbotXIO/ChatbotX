import { SdkException } from "@chatbotx.io/sdk"
import {
  ChatJobAction,
  type ChatJobData,
  queueNames,
} from "@chatbotx.io/worker-config"
import type { Job } from "bullmq"
import { env } from "../env"
import { createQueueWorker } from "../lib/create-queue-worker"
import { isBlockedWorkspace } from "../lib/is-blocked-workspace"
import { isBotMessageQuotaReached } from "../lib/is-bot-message-quota-reached"
import { isFinalAttempt } from "../lib/job-attempts"
import { logger } from "../lib/logger"
import { resolveWorkspaceId } from "../lib/resolve-workspace-id"
import { runJobWithAuditContext } from "../lib/run-job-with-audit-context"
import { runWorker } from "../lib/shutdown"
import { checkOutboundAutomatedResponse } from "./handlers/outbound-automated-response"
import { sendChatMessage, sendFlowStep } from "./handlers/send-flow-step"
import {
  changeMessageStateOnChannel,
  deleteMessageFromChannel,
  editMessageFromChannel,
  sendMessageToChannel,
  sendTypingToChannel,
} from "./handlers/send-message"
import { sendMessengerTemplateMessage } from "./handlers/send-messenger-template"
import {
  sendWhatsappTemplateMessage,
  sendWhatsappTemplateToConversation,
} from "./handlers/send-whatsapp-template"

const botSendActions = new Set<ChatJobData["type"]>([
  ChatJobAction.sendFlowMessage,
  ChatJobAction.sendChatMessage,
  ChatJobAction.sendWhatsappTemplateMessage,
  ChatJobAction.sendWhatsappTemplateToConversation,
  ChatJobAction.sendMessengerTemplateMessage,
])

function isBotSendJob(data: ChatJobData): boolean {
  // A template a workspace member sends from the inbox is recorded as a human
  // message, so it neither counts toward nor is blocked by the bot quota.
  if (
    data.type === ChatJobAction.sendWhatsappTemplateToConversation &&
    data.data.initiatedBy === "user" &&
    data.data.adminId
  ) {
    return false
  }

  if (botSendActions.has(data.type)) {
    return true
  }

  return (
    data.type === ChatJobAction.sendChannelMessage &&
    data.data.message.senderType === "bot"
  )
}

function startChatWorker() {
  createQueueWorker(
    queueNames.enum.chat,
    async (job: Job<ChatJobData>) => {
      const workspaceId = await resolveWorkspaceId(job.data.data)
      if (await isBlockedWorkspace(workspaceId)) {
        return
      }

      if (
        isBotSendJob(job.data) &&
        (await isBotMessageQuotaReached(workspaceId))
      ) {
        logger.info(
          { jobId: job.id, workspaceId },
          "Skipping bot send — quota reached",
        )
        return
      }

      await runJobWithAuditContext(
        { workspaceId, source: `chat:${job.data.type}` },
        async () => {
          switch (job.data.type) {
            case ChatJobAction.sendChannelMessage:
              await sendMessageToChannel(
                job.data.data,
                job.attemptsMade,
                !isFinalAttempt(job),
              )
              return
            case ChatJobAction.sendFlowMessage:
              await sendFlowStep(job.data.data)
              return
            case ChatJobAction.sendChatMessage:
              await sendChatMessage(job.data.data, !isFinalAttempt(job))
              return
            case ChatJobAction.sendWhatsappTemplateMessage:
              await sendWhatsappTemplateMessage(
                job.data.data,
                !isFinalAttempt(job),
              )
              return
            case ChatJobAction.sendWhatsappTemplateToConversation:
              await sendWhatsappTemplateToConversation(
                job.data.data,
                !isFinalAttempt(job),
              )
              return
            case ChatJobAction.sendMessengerTemplateMessage:
              await sendMessengerTemplateMessage(
                job.data.data,
                !isFinalAttempt(job),
              )
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
            case ChatJobAction.checkOutboundAutomatedResponse:
              await checkOutboundAutomatedResponse(job.data.data)
              return
            case "broadcastEvent" as never:
              logger.info(
                { jobId: job.id },
                "Ignoring legacy broadcastEvent job during realtime v2 rollout",
              )
              return
            default:
              throw new SdkException("ChatJobAction action is not defined")
          }
        },
      )
    },
    {
      concurrency: env.CHAT_WORKER_CONCURRENCY,
      limiter: {
        max: env.CHAT_WORKER_RATE_LIMIT_MAX,
        duration: env.CHAT_WORKER_RATE_LIMIT_DURATION_MS,
      },
    },
  )
}

runWorker("chat", startChatWorker)
