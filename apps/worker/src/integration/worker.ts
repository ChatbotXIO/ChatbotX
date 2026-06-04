import { automatedResponseService } from "@chatbotx.io/automated-response"
import { conversationService } from "@chatbotx.io/business"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import { emit } from "@chatbotx.io/event-bus"
import {
  defaultWorkerOptions,
  getRedisConnection,
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
  queueNames,
} from "@chatbotx.io/worker-config"
import { type Job, Worker } from "bullmq"
import { ensureBootstrapped } from "../lib/bootstrap"
import { logger } from "../lib/logger"
import { processAutomatedResponse } from "./handlers/automated-response"
import { runChallenge } from "./handlers/challenge"
import { coexistAttachmentDownload } from "./handlers/coexist/attachment-download"
import { coexistMessengerSync } from "./handlers/coexist/messenger-sync"
import { coexistWhatsappBuffer } from "./handlers/coexist/whatsapp-buffer"
import { coexistWhatsappFlush } from "./handlers/coexist/whatsapp-flush"
import { updateContactAvatar } from "./handlers/contact/update-avatar"
import { agentMarkAsRead, contactMarkAsRead } from "./handlers/conversation"
import {
  runFlowNode,
  runFlowPostback,
  runFlowQuickReply,
} from "./handlers/flow"
import { handleMessageStatus } from "./handlers/message-status"
import { receiveMessage } from "./handlers/received-message"
import { runRef } from "./handlers/ref"
import { handleSendSequenceFlow } from "./handlers/sequence-flow"

async function startIntegrationWorker() {
  try {
    await ensureBootstrapped()
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap integration worker")
    process.exit(1)
  }

  const worker = new Worker(
    queueNames.enum.integration,
    async (job: Job<IntegrationJobData>) => {
      switch (job.data.type) {
        case IntegrationJobAction.incomingMessage: {
          const { message, postbackAction, quickReplyAction, conversation } =
            await receiveMessage(job.data.data)

          if (!message) {
            return
          }

          const isNotPostbackOrQuickReply = !(
            postbackAction || quickReplyAction
          )

          // Check for active challenge (getUserData waiting for input)
          if (
            isNotPostbackOrQuickReply &&
            message.text &&
            message.senderType === "contact" &&
            (await conversationService.ensureActive(conversation))
          ) {
            const additionalAttributes =
              conversation.additionalAttributes as ConversationAttributes

            if (additionalAttributes?.challenge) {
              await integrationQueue.add(IntegrationJobAction.runChallenge, {
                type: IntegrationJobAction.runChallenge,
                data: {
                  conversationId: conversation,
                  contactInboxId: message.contactInboxId,
                  messageId: message.id,
                  challenge: additionalAttributes.challenge,
                },
              })
            } else {
              await automatedResponseService.enqueue({
                conversationId: conversation.id,
                contactInboxId: message.contactInboxId,
                messageId: message.id,
              })
            }
          } else if (isNotPostbackOrQuickReply) {
            // Track no response for messages without content or not from contact
            // (postback/quickReply are tracked in their own handlers)
            await emit("analytics:dashboard", {
              eventType: "message:bot_received",
              workspaceId: message.workspaceId,
              conversationId: message.conversationId,
              messageId: message.id,
              occurredAt: new Date(),
              hasResponse: false,
              responseType: "none",
              routeType: "fallback",
              result: "fallback",
              aiProvider: "none",
              metadata: {
                latency: 0,
                fallbackReason: message.text
                  ? "not_from_contact"
                  : "no_content",
              },
            })
          }
          return
        }
        case IntegrationJobAction.sendFlow: {
          await runFlowNode(job.data.data)
          return
        }
        case IntegrationJobAction.sendSequenceFlow: {
          await handleSendSequenceFlow(job.data.data, job)
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
        case IntegrationJobAction.runRef: {
          await runRef(job.data.data)
          return
        }
        case IntegrationJobAction.runChallenge: {
          await runChallenge(job.data.data)
          return
        }
        case IntegrationJobAction.messageStatus: {
          await handleMessageStatus(job.data.data)
          return
        }
        case IntegrationJobAction.coexistWhatsappBuffer: {
          await coexistWhatsappBuffer(job.data.data)
          return
        }
        case IntegrationJobAction.coexistWhatsappFlush: {
          await coexistWhatsappFlush(job.data.data)
          return
        }
        case IntegrationJobAction.coexistMessengerSync: {
          await coexistMessengerSync(job.data.data)
          return
        }
        case IntegrationJobAction.coexistAttachmentDownload: {
          await coexistAttachmentDownload(job.data.data)
          return
        }
        case IntegrationJobAction.updateContactAvatar: {
          await updateContactAvatar(job.data.data)
          return
        }
        case IntegrationJobAction.createMessage: {
          // No-op — action type exists in the union but has no enqueuer yet.
          return
        }
        default: {
          // Exhaustiveness guard — adding a new IntegrationJobData variant
          // without handling it here becomes a compile error.
          const _exhaustive: never = job.data
          logger.warn({ data: _exhaustive }, "Unhandled integration job type")
          return
        }
      }
    },
    {
      connection: getRedisConnection(),
      ...defaultWorkerOptions,
      // Coexist historical sync chunks are bounded to ~4 min via self-continuation
      // (see coexist-messenger-sync / coexist-whatsapp-flush). Lock sized as:
      // 4 min active + 4 min Graph 5xx retry tail + 2 min bulk INSERT tail.
      lockDuration: 10 * 60 * 1000,
      stalledInterval: 10 * 60 * 1000,
      maxStalledCount: 1,
    },
  )

  worker.on("failed", (job, err) => {
    if (job) {
      logger.error({ err }, `Job ${job.id} has failed`)
    }
  })
}

startIntegrationWorker().catch((err) => {
  logger.error({ err }, "Failed to start integration worker")
  process.exit(1)
})
