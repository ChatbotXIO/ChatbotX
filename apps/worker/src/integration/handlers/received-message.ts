import {
  type ContentType,
  type Conversation,
  Gender,
  type Message,
  MessageType,
  type Prisma,
  prisma,
  SenderType,
} from "@ahachat.ai/database"
import {
  integration,
  type OnMessageArgs,
  type WhatsappAuthValue,
} from "@ahachat.ai/integration-whatsapp"
import type {
  AttachmentEntity,
  ConversationEntity,
  MessageEntity,
} from "@ahachat.ai/sdk"
import { getLogger } from "../../lib/log"
import { uploader } from "@ahachat.ai/filesystem"
import ky from "ky"

interface RunActionResult {
  message: MessageEntity
  conversation: ConversationEntity
  postbackAction: { flowVersionId: string; buttonId: string }
}

export const receiveMessage = async ({
  integrationName,
  payload,
}: {
  integrationName: string
  payload: OnMessageArgs
}): Promise<{
  message: Message
  conversation: Conversation
}> => {
  const logger = getLogger(integrationName)

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

  const {
    message,
    conversation,
    // postbackAction,
  } = (await integration.runAction("receiveMessage", {
    ctx: {
      chatbot: dbIntegrationWhatsapp.chatbot,
      auth: dbIntegrationWhatsapp.auth as WhatsappAuthValue,
      logger: getLogger(integrationName),
      uploader,
    },
    data: payload,
  })) as RunActionResult

  return await prisma.$transaction(async (tx) => {
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
          sourceId: message.sourceId,
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
      await ky.post(
        `${process.env.PARTYSOCKET_URL}/parties/conversations/${newConversation.id}`,
        {
          headers: {
            "X-API-KEY": process.env.PARTYSOCKET_API_KEY,
          },
          json: {
            message: newMessage,
          },
        },
      )
    } catch (error) {
      logger.warn("Unable to emit realtime message", error)
    }

    return { message: newMessage, conversation: newConversation }
  })
}
