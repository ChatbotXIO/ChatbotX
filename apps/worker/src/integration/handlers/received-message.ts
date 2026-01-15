import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ContentType,
  type ConversationModel,
  Gender,
  InboxType,
  type IntegrationType,
  type MessageModel,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import type { MessengerWebhookEvent } from "@aha.chat/integration-messenger"
import type { WhatsappWebhookEvent } from "@aha.chat/integration-whatsapp"
import type { ZaloWebhookEvent } from "@aha.chat/integration-zalo"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { AttachmentEntity, AuthValue, Context } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"
import { allIntegrations, getDBIntegration } from "../../shared/integrations"

export const receiveMessage = async ({
  integrationType,
  payload,
}: {
  integrationType: string
  payload: WhatsappWebhookEvent | MessengerWebhookEvent | ZaloWebhookEvent
}): Promise<{
  message: MessageModel
  conversation: ConversationModel
  postbackAction: string | null
  quickReplyAction: string | null
}> => {
  if (!Object.hasOwn(allIntegrations, integrationType)) {
    throw new Error(`Unsupported integration: ${integrationType}`)
  }

  const dbIntegration = await getDBIntegration(integrationType, payload)
  const { chatbot, chatbotId, inboxId, auth } = dbIntegration
  const ctx = {
    chatbot,
    auth: auth as AuthValue,
    uploader,
  }

  const parsedMessage = await allIntegrations[
    integrationType as IntegrationType
  ]?.actions.receiveMessage({
    ctx,
    data: payload,
  })
  if (!parsedMessage) {
    throw new Error("Unable to parse received message")
  }

  const { message, conversation, postbackAction, quickReplyAction } =
    parsedMessage

  const result = await prisma.$transaction(async (tx) => {
    let newContact = await tx.contact.findUnique({
      where: {
        chatbotId_sourceId: {
          chatbotId,
          sourceId: conversation.contact.sourceId,
        },
      },
    })

    if (!newContact) {
      if (canGetUserProfileIfNeeded(integrationType)) {
        const integration = allIntegrations[integrationType]
        if (integration && "getUserProfile" in integration.actions) {
          const userProfile = await integration.actions.getUserProfile({
            // biome-ignore lint/suspicious/noExplicitAny: safe pass value
            ctx: ctx as Context<any>,
            psid: conversation.contact.sourceId,
          })
          conversation.contact = {
            ...conversation.contact,
            ...userProfile,
          }
        }
      }

      const chatbotUsage = await tx.chatbotUsage.findFirstOrThrow({
        where: { chatbotId },
      })
      if (chatbotUsage.contactsCount >= chatbotUsage.maxContacts) {
        throw new Error("Max contacts reached")
      }

      newContact = await tx.contact.create({
        data: {
          chatbotId,
          sourceId: conversation.contact.sourceId,
          phoneNumber: conversation.contact.phoneNumber,
          email: conversation.contact.email,
          firstName: conversation.contact.firstName,
          lastName: conversation.contact.lastName,
          gender: (conversation.contact.gender as Gender) || Gender.unknown,
          source: integrationType,
          avatar: conversation.contact.avatar,
        },
      })
    }

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

    const now = new Date()

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
        senderType:
          message.messageType === MessageType.outgoing
            ? SenderType.user
            : SenderType.contact,
        chatbotId,
        sourceId: message.sourceId ?? "",
        senderId:
          message.messageType === MessageType.outgoing ? null : newContact.id,
        messageType: message.messageType,
        content: message.content,
        contentType: message.contentType as ContentType,
        contentAttributes: message.contentAttributes as Prisma.InputJsonValue,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        updatedAt: now,
      },
    })

    if (
      message.attachments &&
      newMessage.createdAt.getTime() === now.getTime()
    ) {
      await tx.attachment.createMany({
        data: message.attachments.map((attachment: AttachmentEntity) => ({
          ...attachment,
          messageId: newMessage.id,
          chatbotId: newConversation.chatbotId,
          conversationId: newConversation.id,
        })),
      })
    }

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
    await integrationQueue.add(IntegrationJobAction.sendFlowPostback, {
      type: IntegrationJobAction.sendFlowPostback,
      data: {
        conversationId: result.conversation.id,
        action: postbackAction,
      },
    })
  }

  if (quickReplyAction) {
    await integrationQueue.add(IntegrationJobAction.sendFlowQuickReply, {
      type: IntegrationJobAction.sendFlowQuickReply,
      data: {
        conversationId: result.conversation.id,
        action: quickReplyAction,
      },
    })
  }

  return {
    message: result.message,
    conversation: result.conversation,
    postbackAction,
    quickReplyAction,
  }
}

const canGetUserProfileIfNeeded = (integrationType: string) =>
  integrationType === InboxType.messenger || integrationType === InboxType.zalo
