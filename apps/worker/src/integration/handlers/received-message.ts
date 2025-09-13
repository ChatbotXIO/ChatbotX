import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ChatbotModel,
  type ContentType,
  type ConversationModel,
  Gender,
  type MessageModel,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import type {
  MessengerAuthValue,
  MessengerWebhookEvent,
} from "@aha.chat/integration-messenger"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import {
  integration as integrationWhatsapp,
  type OnMessageArgs,
  type WhatsappAuthValue,
} from "@aha.chat/integration-whatsapp"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type {
  AttachmentEntity,
  ConversationEntity,
  MessageEntity,
} from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

const getDBIntegration = async (
  integrationName: string,
  payload: OnMessageArgs | MessengerWebhookEvent,
) => {
  switch (integrationName) {
    case "whatsapp":
      return await prisma.integrationWhatsapp.findFirstOrThrow({
        where: {
          auth: {
            path: ["metadata", "phoneNumber", "id"],
            equals: (payload as OnMessageArgs).phoneID,
          },
        },
        include: {
          chatbot: true,
        },
      })
    case "messenger":
      return await prisma.integrationMessenger.findFirstOrThrow({
        where: {
          pageId: (payload as MessengerWebhookEvent).entry[0].id,
        },
        include: {
          chatbot: true,
        },
      })
    default:
      throw new Error(`Unsupported integration: ${integrationName}`)
  }
}

const getReceiveMessageTemplate = async (
  integrationName: string,
  {
    chatbot,
    auth,
    payload,
  }: {
    chatbot: ChatbotModel
    auth: Prisma.JsonValue
    payload: OnMessageArgs | MessengerWebhookEvent
  },
): Promise<{
  message: MessageEntity
  conversation: ConversationEntity
  postbackAction?: { flowVersionId: string; buttonId: string } | null
}> => {
  switch (integrationName) {
    case "whatsapp": {
      return await integrationWhatsapp.runAction("receiveMessage", {
        ctx: {
          chatbot,
          auth: auth as WhatsappAuthValue,
          uploader,
        },
        data: payload as OnMessageArgs,
      })
    }
    case "messenger":
      return await integrationMessenger.runAction("receiveMessage", {
        ctx: {
          chatbot,
          auth: auth as MessengerAuthValue,
          uploader,
        },
        data: payload as MessengerWebhookEvent,
      })
    default:
      throw new Error(`Unsupported integration: ${integrationName}`)
  }
}

const getMessageType = (
  integrationName: string,
  payload: OnMessageArgs | MessengerWebhookEvent,
): MessageType => {
  switch (integrationName) {
    case "whatsapp":
      return MessageType.INCOMING
    case "messenger":
      return (payload as MessengerWebhookEvent).entry[0].messaging[0].message
        ?.is_echo
        ? MessageType.OUTGOING
        : MessageType.INCOMING
    default:
      return MessageType.INCOMING
  }
}

export const receiveMessage = async ({
  integrationName,
  payload,
}: {
  integrationName: string
  payload: OnMessageArgs | MessengerWebhookEvent
}): Promise<{
  message: MessageModel
  conversation: ConversationModel
}> => {
  const dbIntegration = await getDBIntegration(integrationName, payload)
  const { chatbot, chatbotId, inboxId, auth } = dbIntegration
  const { message, conversation, postbackAction } =
    await getReceiveMessageTemplate(integrationName, {
      chatbot,
      auth,
      payload,
    })
  const messageType = getMessageType(integrationName, payload)

  const result = await prisma.$transaction(async (tx) => {
    const newContact = await tx.contact.upsert({
      where: {
        chatbotId_sourceId: {
          chatbotId,
          sourceId: conversation.contact.sourceId,
        },
      },
      create: {
        chatbotId,
        sourceId: conversation.contact.sourceId,
        phoneNumber: conversation.contact.phoneNumber,
        firstName: conversation.contact.name,
        gender: Gender.UNKNOWN,
        source: integrationName,
      },
      update: {
        updatedAt: new Date(),
      },
    })

    const newConversation = await tx.conversation.upsert({
      where: {
        contactId: newContact.id,
      },
      create: {
        sourceId: conversation.sourceId,
        conversationAttributes:
          conversation.conversationAttributes as Prisma.InputJsonValue,
        inboxId,
        chatbotId,
        contactId: newContact.id,
      },
      update: {
        updatedAt: new Date(),
      },
    })

    const newMessage = await tx.message.upsert({
      where: {
        chatbotId_sourceId: {
          chatbotId,
          sourceId: message.sourceId ?? "",
        },
      },
      create: {
        conversationId: newConversation.id,
        inboxId,
        senderType: SenderType.CONTACT,
        chatbotId,
        senderId: newContact.id,
        messageType,
        content: message.content,
        contentType: message.contentType as ContentType,
        contentAttributes: message.contentAttributes as Prisma.InputJsonValue,
        attachments: message.attachments
          ? {
              create: message.attachments.map(
                (attachment: AttachmentEntity) => {
                  return {
                    chatbotId: newConversation.chatbotId,
                    conversationId: newConversation.id,
                    ...attachment,
                  }
                },
              ),
            }
          : undefined,
      },
      update: {},
    })

    // emit new message to socket
    try {
      broadcastToChatbotParty(newConversation.chatbotId, {
        eventType: RealtimeEventType.CREATE_MESSAGE,
        data: newMessage,
      })
    } catch (error) {
      logger.warn("Unable to emit realtime message", error)
    }

    return { message: newMessage, conversation: newConversation }
  })

  if (postbackAction) {
    await integrationQueue.add(IntegrationJobAction.SEND_FLOW_POSTBACK, {
      type: IntegrationJobAction.SEND_FLOW_POSTBACK,
      data: {
        conversationId: result.conversation.id,
        flowVersionId: postbackAction.flowVersionId,
        buttonId: postbackAction.buttonId,
      },
    })
  }

  return result
}
