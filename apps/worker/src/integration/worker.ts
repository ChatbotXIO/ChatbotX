import { automatedResponseService } from "@chatbotx.io/automated-response"
import {
  defaultWorkerOptions,
  getRedisConnection,
  IntegrationJobAction,
  type IntegrationJobData,
  queueName,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { processAutomatedResponse } from "./handlers/automated-response"
import { trackBotResponse } from "./handlers/automated-response/track-bot-response"
import { runChallenge } from "./handlers/challenge"
import { agentMarkAsRead, contactMarkAsRead } from "./handlers/conversation"
import {
  runFlowNode,
  runFlowPostback,
  runFlowQuickReply,
} from "./handlers/flow"
import { handleMessageStatus } from "./handlers/message-status"
import { receiveMessage } from "./handlers/received-message"
import { runRef } from "./handlers/ref"
import { sendBroadcast } from "./handlers/send-broadcast"

async function startIntegrationWorker() {
  try {
    await ensureBootstrapped()
    logger.info("Integration worker bootstrapped successfully")
  } catch (err) {
    logger.error(err, "Failed to bootstrap integration worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueName.integration,
    async (job: Job<IntegrationJobData>) => {
      logger.info(job.data, "Worker received job")
      switch (job.data.type) {
        case IntegrationJobAction.incomingMessage: {
          const { message, postbackAction, quickReplyAction, conversation } =
            await receiveMessage(job.data.data)

          // Trigger automated response if the message is from a user
          if (
            !(postbackAction || quickReplyAction) &&
            message.text &&
            message.senderType === "contact" &&
            conversation.botEnabled
          ) {
            await automatedResponseService.enqueue({
              conversationId: conversation.id,
              contactInboxId: message.contactInboxId,
              messageId: message.id,
            })
          } else if (!(postbackAction || quickReplyAction)) {
            // Track no response for messages without content or not from contact
            // (postback/quickReply are tracked in their own handlers)
            await trackBotResponse({
              workspaceId: message.workspaceId,
              conversationId: message.conversationId,
              messageId: message.id,
              hasResponse: false,
              responseType: "none",
              routeType: "fallback",
              result: "fallback",
              aiProvider: "none",
              metadata: {
                fallbackReason: message.text
                  ? "not_from_contact"
                  : "no_content",
              },
              startTime: Date.now(),
            })
          }
          return
        }
        case IntegrationJobAction.sendFlow: {
          await runFlowNode(job.data)
          return
        }
        case IntegrationJobAction.runFlowPostback: {
          await runFlowPostback(job.data.data)
          return
        }
        case IntegrationJobAction.runFlowQuickReply: {
          await runFlowQuickReply(job.data.data)
          return
        }
        case IntegrationJobAction.processAutomatedResonse: {
          await processAutomatedResponse(job.data.data)
          return
        }
        case IntegrationJobAction.agentMarkAsRead: {
          await agentMarkAsRead(job.data.data)
          return
        }
        case IntegrationJobAction.contactMarkAsRead: {
          await contactMarkAsRead(job.data.data)
          return
        }
        case IntegrationJobAction.sendBroadcast: {
          await sendBroadcast(job.data.data.broadcastId)
          return
        }
        case IntegrationJobAction.runRef: {
          await runRef(job.data.data)
          return
        }
        case IntegrationJobAction.runChallenge: {
          await runChallenge(job.data.data)
          return
        }
        case IntegrationJobAction.blockContact: {
          // await broadcastBlockContactEvent(job.data.data)
          return
        }
        case IntegrationJobAction.unblockContact: {
          // await broadcastUnblockContactEvent(job.data.data)
          return
        }
        case IntegrationJobAction.assignConversation: {
          // await broadcastAssignConversation(job.data.data)
          return
        }
        case IntegrationJobAction.messageStatus: {
          await handleMessageStatus(job.data.data)
          return
        }
        default:
          return
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

startIntegrationWorker().catch((err) => {
  logger.error(err, "Failed to start integration worker")
  process.exit(1)
})
