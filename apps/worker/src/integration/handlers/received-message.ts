import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ContentType,
  type ConversationModel,
  Gender,
  InboxType,
  type MessageModel,
  SenderType,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import type { MessengerWebhookEvent } from "@aha.chat/integration-messenger"
import type { OnMessageArgs } from "@aha.chat/integration-whatsapp"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type {
  AttachmentEntity,
  AuthValue,
  Context,
  ConversationEntity,
  MessageEntity,
} from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"
import { allIntegrations } from "../../shared/integrations"

const getDBIntegration = async (
  integrationName: string,
  payload: OnMessageArgs | MessengerWebhookEvent,
) => {
  switch (integrationName) {
    case InboxType.WHATSAPP:
      return await prisma.integrationWhatsapp.findFirstOrThrow({
        where: {
          phoneNumberId: (payload as OnMessageArgs).phoneID,
        },
        include: {
          chatbot: true,
        },
      })
    case InboxType.MESSENGER:
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

const parseReceivedMessage = async (
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  ctx: Context<any>,
  integrationName: string,
  payload: OnMessageArgs | MessengerWebhookEvent,
): Promise<
  | {
      message: MessageEntity
      conversation: ConversationEntity
      postbackAction?: { flowVersionId: string; buttonId: string } | null
    }
  | undefined
> => {
  return await allIntegrations[
    integrationName as keyof typeof allIntegrations
  ]?.actions.receiveMessage({
    ctx,
    // biome-ignore lint/suspicious/noExplicitAny: safe pass value
    data: payload as any,
  })
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
  const intName = integrationName.toUpperCase()

  if (!Object.hasOwn(allIntegrations, intName)) {
    throw new Error(`Unsupported integration: ${intName}`)
  }

  const dbIntegration = await getDBIntegration(intName, payload)
  const { chatbot, chatbotId, inboxId, auth } = dbIntegration
  const ctx = {
    chatbot,
    auth: auth as AuthValue,
    uploader,
  }
  const parsedMessage = await parseReceivedMessage(ctx, intName, payload)
  if (!parsedMessage) {
    throw new Error("Unable to parse received message")
  }

  const { message, conversation, postbackAction } = parsedMessage
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
      if (canGetUserProfileIfNeeded(intName)) {
        const integration = allIntegrations[intName]
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

      newContact = await tx.contact.create({
        data: {
          chatbotId,
          sourceId: conversation.contact.sourceId,
          phoneNumber: conversation.contact.phoneNumber,
          email: conversation.contact.email,
          firstName: conversation.contact.firstName,
          lastName: conversation.contact.lastName,
          gender: (conversation.contact.gender as Gender) || Gender.UNKNOWN,
          source: integrationName,
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
        messageType: message.messageType,
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

const canGetUserProfileIfNeeded = (integrationName: string) => {
  return integrationName === InboxType.MESSENGER
}
