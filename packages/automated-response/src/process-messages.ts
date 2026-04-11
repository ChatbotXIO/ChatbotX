import { trackingResponseTypes } from "@chatbotx.io/analytics"
import { db } from "@chatbotx.io/database/client"
import type {
  ContactInboxModel,
  ConversationModel,
  MessageModel,
} from "@chatbotx.io/database/types"
import { simpleQueue } from "@chatbotx.io/redis"
import { contactVariableService } from "@chatbotx.io/variables"
import {
  ChatJobAction,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { getKey } from "./constants"
import { logger } from "./lib/logger"
import { getAllWorkspaceAutomatedResponses } from "./utils"

export const processPendingMessages = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}): Promise<boolean> => {
  const result = await getMessagesFromStoreAndProcess(props)

  // Clear the queue after processing
  await simpleQueue.clear(
    getKey({
      conversationId: props.conversation.id,
      contactInboxId: props.contactInbox.id,
    }),
  )

  return result
}

const getMessagesFromStoreAndProcess = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}): Promise<boolean> => {
  const key = getKey({
    conversationId: props.conversation.id,
    contactInboxId: props.contactInbox.id,
  })

  const messageIds = await simpleQueue.getAll(key)
  if (messageIds.length === 0) {
    logger.debug(props, "Automated response queue is empty")
    return false
  }

  // Only process text messages
  const messages = await db.query.messageModel
    .findMany({
      where: {
        contactInboxId: props.contactInbox.id,
        id: {
          in: messageIds,
        },
      },
      columns: {
        id: true,
        text: true,
      },
    })
    .then((data) => {
      return data.filter((v) => Boolean(v.text))
    })
  if (messages.length === 0) {
    logger.debug(props, "No message to process")
    return false
  }

  return replyByAutomatedResponse({
    conversation: props.conversation,
    contactInbox: props.contactInbox,
    messages,
  })
}

const replyByAutomatedResponse = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  messages: Pick<MessageModel, "id" | "text">[]
}): Promise<boolean> => {
  const { conversation, contactInbox, messages } = props
  const allAutomatedResponses = await getAllWorkspaceAutomatedResponses(
    conversation.workspaceId,
  )

  let replied = false
  for (const message of messages) {
    if (!message.text) {
      continue
    }
    const text = message.text.toLowerCase()
    for (const automatedResponse of allAutomatedResponses) {
      const matched = (automatedResponse.keywords as string[])
        .map((v) => v.toLowerCase())
        .some((v) => text.includes(v))

      if (!matched) {
        continue
      }

      if (automatedResponse.flowId) {
        const flow = await db.query.flowModel.findFirst({
          where: {
            id: automatedResponse.flowId,
            currentVersionId: { isNotNull: true },
          },
        })
        if (flow) {
          await integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: conversation.id,
              contactInboxId: contactInbox.id,
              flowId: flow.id,
              trackingContext: {
                aiProvider: "none",
                messageId: message.id,
                conversationId: conversation.id,
                responseType: "automated_response",
                startTime: Date.now(),
                triggerType: "contact_message_in",
                workspaceId: conversation.workspaceId,
              },
            },
          })
          replied = true
          return replied
        }
      } else if (automatedResponse.text) {
        const variables = await contactVariableService.getAll(
          conversation.contactId,
        )
        const stepMessage = await contactVariableService.replaceAll({
          text: automatedResponse.text,
          variables,
        })
        await chatQueue.add(ChatJobAction.sendChatMessage, {
          type: ChatJobAction.sendChatMessage,
          data: {
            conversation,
            text: stepMessage,
            trackingContext: {
              aiProvider: "none",
              conversationId: conversation.id,
              messageId: message.id,
              responseType: trackingResponseTypes.enum.automated_response,
              startTime: Date.now(),
              triggerType: "contact_message_int",
              workspaceId: conversation.workspaceId,
            },
          },
        })
        replied = true
        return replied
      }
    }
  }

  return replied
}
