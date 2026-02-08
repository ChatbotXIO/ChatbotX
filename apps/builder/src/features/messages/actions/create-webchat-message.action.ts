"use server"

import {
  Gender,
  type PrismaTransactionalClient,
  prisma,
} from "@aha.chat/database"
import {
  ContentType,
  type ConversationAttributes,
  IntegrationType,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import { type UploadedFile, uploadMultipleFiles } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { randomString } from "remeda"
import type { AttachmentResource } from "@/features/attachments/schemas"
import { BaseException } from "@/lib/errors/exception"
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
  const { conversation } = await prisma.$transaction(async (tx) => {
    return await getConversationFromInput(tx, parsedInput)
  })

  // Process flow if exists
  if ("flowId" in parsedInput) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: parsedInput.flowId,
      },
    })
    return null
  }

  // Process ref if exists
  if ("initRef" in parsedInput && parsedInput.initRef) {
    await integrationQueue.add(IntegrationJobAction.runRef, {
      type: IntegrationJobAction.runRef,
      data: {
        conversationId: conversation.id,
        ref: parsedInput.initRef,
      },
    })
    return null
  }

  if ("postback" in parsedInput && parsedInput.postback) {
    await integrationQueue.add(IntegrationJobAction.runFlowPostback, {
      type: IntegrationJobAction.runFlowPostback,
      data: {
        conversationId: conversation.id,
        action: parsedInput.postback,
      },
    })
  }

  // Create conversation if it does not exist
  return await prisma.$transaction(async (tx) => {
    // upload file if exists
    let uploadedFiles: UploadedFile[] = []
    if ("files" in parsedInput && parsedInput.files.length > 0) {
      uploadedFiles = await uploadMultipleFiles(
        parsedInput.files,
        `public/chatbots/${parsedInput.chatbotId}/conversations/${conversation.id}`,
      )
    }

    if (
      "content" in parsedInput &&
      (parsedInput.content || uploadedFiles.length > 0)
    ) {
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

      if (uploadedFiles.length > 0) {
        const attachments = await tx.attachment.createManyAndReturn({
          data: uploadedFiles.map((file) => ({
            messageId: newMessage.id,
            chatbotId: newMessage.chatbotId,
            conversationId: newMessage.conversationId,
            ...file,
          })),
        })

        newMessage.attachments = attachments as AttachmentResource[]
      }

      await tx.conversation.update({
        where: {
          id: conversation.id,
        },
        data: {
          contactLastSeenAt: new Date(),
          lastActivityAt: new Date(),
          contactRepliedAt: new Date(),
        },
      })

      // Broadcast realtime message
      const promises: Promise<unknown>[] = []
      promises.push(
        broadcastToChatbotParty(newMessage.chatbotId, {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...newMessage,
            clientId: parsedInput.clientId,
          },
        }),
      )

      if (uploadedFiles.length > 0 && conversation.sourceId) {
        promises.push(
          broadcastToGuestParty(conversation.sourceId, {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...newMessage,
              clientId: parsedInput.clientId,
            },
          }),
        )
      }

      const conversationAttributes =
        conversation.conversationAttributes as unknown as ConversationAttributes

      if (conversationAttributes?.challenge) {
        promises.push(
          integrationQueue.add(
            IntegrationJobAction.runChallenge,
            {
              type: IntegrationJobAction.runChallenge,
              data: {
                conversationId: conversation.id,
                challenge: conversationAttributes?.challenge,
              },
            },
            {
              deduplication: {
                id: `conversation-${conversation.id}-challenge`,
              },
            },
          ),
        )
      } else if (
        !conversation.liveChatEnabled &&
        newMessage.content &&
        !("postback" in parsedInput && parsedInput.postback)
      ) {
        // trigger automated response if the message is not a postback
        promises.push(
          integrationQueue.add(IntegrationJobAction.triggerAutomatedResponse, {
            type: IntegrationJobAction.triggerAutomatedResponse,
            data: {
              message: newMessage as OutgoingMessageEntity,
            },
          }),
        )
      }

      if (promises.length > 0) {
        await Promise.all(promises)
      }

      return newMessage
    }

    return null
  })
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
