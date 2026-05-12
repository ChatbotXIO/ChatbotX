import { automatedResponseService } from "@chatbotx.io/automated-response"
import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import {
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { createBullMQWorker } from "../lib/create-worker"
import { logger } from "../lib/logger"
import { processAutomatedResponse } from "./handlers/automated-response"
import { trackBotResponse } from "./handlers/automated-response/track-bot-response"
import { runChallenge } from "./handlers/challenge"
import {
  agentMarkAsRead,
  contactMarkAsRead,
  ensureConversationActive,
} from "./handlers/conversation"
import {
  runFlowNode,
  runFlowPostback,
  runFlowQuickReply,
} from "./handlers/flow"
import { handleMessageStatus } from "./handlers/message-status"
import { receiveMessage } from "./handlers/received-message"
import { runRef } from "./handlers/ref"
import { handleSendSequenceFlow } from "./handlers/sequence-flow"

await createBullMQWorker<IntegrationJobData>({
  name: "integration",
  label: "integration",
  logJobReceipt: true,
  handlers: {
    [IntegrationJobAction.incomingMessage]: async (data) => {
      const { message, postbackAction, quickReplyAction, conversation } =
        await receiveMessage(data)

      if (!message) {
        return
      }

      const isNotPostbackOrQuickReply = !(postbackAction || quickReplyAction)

      if (
        isNotPostbackOrQuickReply &&
        message.text &&
        message.senderType === "contact" &&
        (await ensureConversationActive(conversation))
      ) {
        const additionalAttributes =
          conversation.additionalAttributes as ConversationAttributes

        if (additionalAttributes?.challenge) {
          await integrationQueue.add(IntegrationJobAction.runChallenge, {
            type: IntegrationJobAction.runChallenge,
            data: {
              conversationId: conversation,
              contactInboxId: message.contactInboxId,
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
            fallbackReason: message.text ? "not_from_contact" : "no_content",
          },
          startTime: Date.now(),
        })
      }
    },
    [IntegrationJobAction.sendFlow]: (data) => runFlowNode(data),
    [IntegrationJobAction.sendSequenceFlow]: (data, job) =>
      handleSendSequenceFlow(data, job),
    [IntegrationJobAction.runFlowPostback]: (data) => runFlowPostback(data),
    [IntegrationJobAction.runFlowQuickReply]: (data) => runFlowQuickReply(data),
    [IntegrationJobAction.processAutomatedResonse]: (data) =>
      processAutomatedResponse(data),
    [IntegrationJobAction.agentMarkAsRead]: (data) => agentMarkAsRead(data),
    [IntegrationJobAction.contactMarkAsRead]: (data) => contactMarkAsRead(data),
    [IntegrationJobAction.runRef]: (data) => runRef(data),
    [IntegrationJobAction.runChallenge]: (data) => runChallenge(data),
    [IntegrationJobAction.blockContact]: () => {
      // intentionally a no-op today; broadcastBlockContactEvent is commented out
    },
    [IntegrationJobAction.unblockContact]: () => {
      // intentionally a no-op today; broadcastUnblockContactEvent is commented out
    },
    [IntegrationJobAction.assignConversation]: () => {
      // intentionally a no-op today; broadcastAssignConversation is commented out
    },
    [IntegrationJobAction.messageStatus]: (data) => handleMessageStatus(data),
    [IntegrationJobAction.createMessage]: () => {
      logger.warn("IntegrationJobAction.createMessage is not implemented")
    },
  },
})
