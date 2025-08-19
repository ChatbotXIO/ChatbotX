import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ContentType,
  type ConversationModel,
  Gender,
  type MessageModel,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import {
  integration,
  type OnMessageArgs,
  type WhatsappAuthValue,
} from "@aha.chat/integration-whatsapp"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { AttachmentEntity } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

export const receiveMessage = async ({
  integrationName,
  payload,
}: {
  integrationName: string
  payload: OnMessageArgs
}): Promise<{
  message: MessageModel
  conversation: ConversationModel
}> => {
  const dbIntegrationWhatsapp =
    await prisma.integrationWhatsapp.findFirstOrThrow({
      where: {
        auth: {
          path: ["metadata", "phoneNumber", "id"],
          equals: payload.phoneID,
        },
      },
      include: {
        chatbot: true,
      },
    })

  const { message, conversation, postbackAction } = await integration.runAction(
    "receiveMessage",
    {
      ctx: {
        chatbot: dbIntegrationWhatsapp.chatbot,
        auth: dbIntegrationWhatsapp.auth as WhatsappAuthValue,
        uploader,
      },
      data: payload,
    },
  )

  const result = await prisma.$transaction(async (tx) => {
    const newContact = await tx.contact.upsert({
      where: {
        chatbotId_sourceId: {
          chatbotId: dbIntegrationWhatsapp.chatbotId,
          sourceId: conversation.contact.sourceId,
        },
      },
      create: {
        sourceId: conversation.contact.sourceId,
        phoneNumber: conversation.contact.phoneNumber,
        firstName: conversation.contact.name,
        chatbotId: dbIntegrationWhatsapp.chatbotId,
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
        inboxId: dbIntegrationWhatsapp.inboxId,
        chatbotId: dbIntegrationWhatsapp.chatbotId,
        contactId: newContact.id,
      },
      update: {
        updatedAt: new Date(),
      },
    })

    const newMessage = await tx.message.upsert({
      where: {
        chatbotId_sourceId: {
          chatbotId: dbIntegrationWhatsapp.chatbotId,
          sourceId: message.sourceId ?? "",
        },
      },
      create: {
        conversationId: newConversation.id,
        inboxId: dbIntegrationWhatsapp.inboxId,
        senderType: SenderType.CONTACT,
        chatbotId: dbIntegrationWhatsapp.chatbotId,
        senderId: newContact.id,
        messageType: MessageType.INCOMING,
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
