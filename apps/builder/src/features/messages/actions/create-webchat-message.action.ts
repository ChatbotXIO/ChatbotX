"use server"

import {
  Gender,
  type PrismaTransactionalClient,
  prisma,
} from "@aha.chat/database"
import {
  ContentType,
  IntegrationType,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import { decodeButtonPayload } from "@aha.chat/flow-config"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import {
  guessFileTypeFromMimeType,
  type OutgoingMessageEntity,
} from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import { randomString } from "remeda"
import type { AttachmentResource } from "@/features/attachments/schemas"
import { BaseException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { actionClient } from "@/lib/safe-action"
import type { MessageResource } from "../schemas"
import {
  type CreateWebchatMessageRequest,
  createWebchatMessageRequest,
} from "../schemas/create-message.schema"

export const createWebchatMessageAction = actionClient
  .inputSchema(createWebchatMessageRequest)
  .action(handleCreateWebchatMessage)

export async function handleCreateWebchatMessage({
  parsedInput,
}: {
  parsedInput: CreateWebchatMessageRequest
}) {
  const promises: Promise<unknown>[] = []

  // Create conversation if it does not exist
  const message = await prisma.$transaction(async (tx) => {
    const { conversation } = await getConversationFromInput(tx, parsedInput)

    // upload file if exists
    let path: string | null = null
    let imageDimensions: { width: number; height: number } | null = null
    if ("files" in parsedInput && parsedInput.files.length > 0) {
      const file = parsedInput.files[0] as File
      path = `public/chatbots/${parsedInput.chatbotId}/conversations/${conversation.id}/${createId()}`

      const buffer = (await file.arrayBuffer()) as unknown as Buffer
      await uploader.putObject(path, buffer, {
        ACL: "public-read",
        ContentLength: file.size,
        ContentType: file.type,
      })

      // try to find image dimensions
      if (file.type.startsWith("image/")) {
        try {
          const { width, height } = await imageSize(new Uint8Array(buffer))
          imageDimensions = { width, height }
        } catch (error) {
          logger.warn("Unable to retrieve image dimensions", error)
        }
      }
    }

    const newMessage: MessageResource = await tx.message.create({
      data: {
        content: "content" in parsedInput ? parsedInput.content : null,
        messageType: MessageType.incoming,
        chatbotId: conversation.chatbotId,
        conversationId: conversation.id,
        senderType: SenderType.contact,
        senderId: conversation.contactId,
        inboxId: conversation.inboxId,
        contentType: ContentType.text,
      },
    })

    if (path && "files" in parsedInput && parsedInput.files?.[0]) {
      // create attachment if path exists
      const file = parsedInput.files[0]
      const mimeType = file.type as string
      const attachment = await tx.attachment.create({
        data: {
          messageId: newMessage.id,
          chatbotId: newMessage.chatbotId,
          conversationId: newMessage.conversationId,
          originPath: path,
          name: file.name,
          mimeType,
          size: file.size,
          fileType: guessFileTypeFromMimeType(mimeType),
          ...imageDimensions,
        },
      })

      newMessage.attachments = [attachment as AttachmentResource]
    }

    if ("postback" in parsedInput && parsedInput.postback) {
      const postbackData = decodeButtonPayload(parsedInput.postback)
      if (postbackData) {
        promises.push(
          integrationQueue.add(IntegrationJobAction.sendFlowPostback, {
            type: IntegrationJobAction.sendFlowPostback,
            data: {
              conversationId: conversation.id,
              action: parsedInput.postback,
            },
          }),
        )
      }
    }

    if ("flowId" in parsedInput && parsedInput.flowId) {
      const flow = await tx.flow.findFirst({
        where: {
          chatbotId: conversation.chatbotId,
          id: parsedInput.flowId,
          active: true,
        },
      })
      if (flow) {
        promises.push(
          integrationQueue.add(IntegrationJobAction.sendFlow, {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: conversation.id,
              flowId: parsedInput.flowId,
            },
          }),
        )
      }
    }

    await tx.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        agentLastSeenAt: new Date(),
        lastActivityAt: new Date(),
      },
    })

    return newMessage
  })

  promises.push(
    broadcastToChatbotParty(message.chatbotId, {
      eventType: RealtimeEventType.CREATE_MESSAGE,
      data: {
        ...message,
        clientId: parsedInput.clientId,
      },
    }),
  )

  // trigger automated response if the message is not a postback
  if (message.content && !("postback" in parsedInput && parsedInput.postback)) {
    promises.push(
      integrationQueue.add(IntegrationJobAction.triggerAutomatedResponse, {
        type: IntegrationJobAction.triggerAutomatedResponse,
        data: {
          message: message as OutgoingMessageEntity,
        },
      }),
    )
  }

  // Broadcast and send
  if (promises.length > 0) {
    await Promise.all(promises)
  }

  return message
}

async function getConversationFromInput(
  tx: PrismaTransactionalClient,
  parsedInput: CreateWebchatMessageRequest,
) {
  const integrationWebchat = await tx.integrationWebchat.findFirst({
    where: {
      chatbotId: parsedInput.chatbotId,
      id: parsedInput.webchatId,
    },
  })
  if (!integrationWebchat) {
    throw new BaseException("Channel not found")
  }

  const sourceId = parsedInput.guestConversationId
  let conversation = await tx.conversation.findFirst({
    where: {
      chatbotId: parsedInput.chatbotId,
      sourceId,
      inboxId: integrationWebchat.inboxId,
    },
  })

  if (!conversation) {
    // find or create contact
    let contact = await tx.contact.findFirst({
      where: {
        chatbotId: parsedInput.chatbotId,
        sourceId,
      },
    })

    if (!contact) {
      const chatbotUsage = await tx.chatbotUsage.findFirstOrThrow({
        where: { chatbotId: parsedInput.chatbotId },
      })
      if (chatbotUsage.contactsCount >= chatbotUsage.maxContacts) {
        throw new BaseException("Max contacts reached")
      }

      contact = await tx.contact.create({
        data: {
          chatbotId: parsedInput.chatbotId,
          sourceId,
          email: parsedInput.guestConversationId,
          source: IntegrationType.webchat,
          gender: Gender.unknown,
          firstName: "Guest",
          lastName: randomString(10),
        },
      })
    }

    conversation = await tx.conversation.create({
      data: {
        chatbotId: parsedInput.chatbotId,
        sourceId,
        inboxId: integrationWebchat.inboxId,
        contactId: contact.id,
      },
    })
  }

  if (!conversation) {
    throw new BaseException("Conversation not found")
  }

  return { conversation }
}
