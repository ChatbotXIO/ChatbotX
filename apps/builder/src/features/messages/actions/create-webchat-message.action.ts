"use server"

import { Gender, InboxType, IntegrationType, prisma } from "@aha.chat/database"
import {
  ContentType,
  type ConversationModel,
  MessageType,
  SenderType,
} from "@aha.chat/database/types"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { OutgoingMessageEntity } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { revalidateTag } from "next/cache"
import { randomString } from "remeda"
import type { AttachmentResource } from "@/features/attachments/schemas"
import { BaseException } from "@/lib/error"
import { actionClient } from "@/lib/safe-action"
import type { MessageResource } from "../schemas"
import {
  type CreateWebchatMessageRequest,
  createWebchatMessageRequest,
  guessFileTypeFromMimeType,
} from "../schemas/create-message.schema"

export const createWebchatMessageAction = actionClient
  .inputSchema(createWebchatMessageRequest)
  .action(
    async ({ parsedInput }: { parsedInput: CreateWebchatMessageRequest }) => {
      // Create conversation if it does not exist
      let conversation: ConversationModel | null = null

      const inbox = await prisma.inbox.findFirst({
        where: {
          chatbotId: parsedInput.chatbotId,
          inboxType: InboxType.WEBCHAT,
        },
      })
      if (!inbox) {
        throw new BaseException("Inbox not found")
      }

      const sourceId = parsedInput.guestConversationId
      conversation = await prisma.conversation.findFirst({
        where: {
          chatbotId: parsedInput.chatbotId,
          sourceId,
          inboxId: inbox.id,
        },
      })

      if (!conversation) {
        // find or create contact
        let contact = await prisma.contact.findFirst({
          where: {
            chatbotId: parsedInput.chatbotId,
            sourceId,
          },
        })

        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              chatbotId: parsedInput.chatbotId,
              sourceId,
              email: parsedInput.guestConversationId,
              source: IntegrationType.WEBCHAT,
              gender: Gender.UNKNOWN,
              firstName: "Guest",
              lastName: randomString(10),
            },
          })
        }

        conversation = await prisma.conversation.create({
          data: {
            chatbotId: parsedInput.chatbotId,
            sourceId,
            inboxId: inbox.id,
            contactId: contact.id,
          },
        })
      }

      if (!conversation) {
        throw new BaseException("Conversation not found")
      }

      const message = await prisma.$transaction(async (tx) => {
        const newMessage: MessageResource = await tx.message.create({
          data: {
            content: "content" in parsedInput ? parsedInput.content : null,
            messageType: MessageType.INCOMING,
            chatbotId: conversation.chatbotId,
            conversationId: conversation.id,
            senderType: SenderType.CONTACT,
            senderId: conversation.contactId,
            inboxId: conversation.inboxId,
            contentType: ContentType.TEXT,
          },
        })

        // create attachment if path exists
        if ("attachment" in parsedInput) {
          const attachment = await tx.attachment.create({
            data: {
              messageId: newMessage.id,
              chatbotId: newMessage.chatbotId,
              conversationId: newMessage.conversationId,
              originPath: parsedInput.attachment.originPath,
              name: parsedInput.attachment.name,
              mimeType: parsedInput.attachment.mimeType,
              size: parsedInput.attachment.size,
              fileType: guessFileTypeFromMimeType(
                parsedInput.attachment.mimeType,
              ),
              width: parsedInput.attachment.width,
              height: parsedInput.attachment.height,
            },
          })

          newMessage.attachments = [attachment as AttachmentResource]
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

      const promises: Promise<unknown>[] = [
        broadcastToChatbotParty(message.chatbotId, {
          eventType: RealtimeEventType.CREATE_MESSAGE,
          data: {
            ...message,
            clientId: parsedInput.clientId,
          },
        }),
      ]
      if (message.content) {
        promises.push(
          integrationQueue.add(
            IntegrationJobAction.TRIGGER_AUTOMATED_RESPONSE,
            {
              type: IntegrationJobAction.TRIGGER_AUTOMATED_RESPONSE,
              data: {
                message: message as OutgoingMessageEntity,
              },
            },
          ),
        )
      }

      // Broadcast and send
      await Promise.all(promises)

      revalidateTag(`chatbots:${conversation.chatbotId}:conversations`)
    },
  )
