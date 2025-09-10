"use server"

import { prisma } from "@aha.chat/database"
import {
  ContentType,
  MessageType,
  SenderType,
  type UserModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { AttachmentEntity, ConversationEntity } from "@aha.chat/sdk"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { revalidateTag } from "next/cache"
import type { AttachmentResource } from "@/features/attachments/schemas"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { findConversation } from "@/features/conversations/queries/list-conversations.query"
import { chatbotActionClient } from "@/lib/safe-action"
import type { MessageResource } from "../schemas"
import {
  type CreateMessageRequest,
  createMessageRequest,
  guessFileTypeFromMimeType,
} from "../schemas/create-message.schema"

export const createMessageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(createMessageRequest)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, conversationId],
      parsedInput,
    }: {
      ctx: { user: UserModel }
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: CreateMessageRequest
    }) => {
      const { data: conversation } = await findConversation({
        id: conversationId,
        chatbotId,
      })

      const message = await prisma.$transaction(async (tx) => {
        const newMessage: MessageResource = await tx.message.create({
          data: {
            content: "content" in parsedInput ? parsedInput.content : null,
            messageType: MessageType.OUTGOING,
            chatbotId: conversation.chatbotId,
            conversationId,
            senderType: SenderType.USER,
            senderId: ctx.user.id,
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
              fileType: guessFileTypeFromMimeType(parsedInput.attachment.mimeType),
              width: parsedInput.attachment.width,
              height: parsedInput.attachment.height,
            },
          })

          newMessage.attachments = [attachment as AttachmentResource]
        }

        await tx.conversation.update({
          where: {
            id: conversationId,
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
      if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
        promises.push(
          broadcastToGuestParty(conversation.sourceId, {
            eventType: RealtimeEventType.CREATE_MESSAGE,
            data: {
              ...message,
              clientId: parsedInput.clientId,
            },
          }),
        )
      } else {
        promises.push(
          chatQueue.add(ChatJobAction.SEND_EXTERNAL_MESSAGE, {
            type: ChatJobAction.SEND_EXTERNAL_MESSAGE,
            data: {
              conversation: conversation as ConversationEntity,
              message: {
                ...message,
                clientId: parsedInput.clientId,
                sourceId: message.sourceId || "",
                contentType: message.contentType as unknown as ContentType,
                content: message.content ?? "",
                attachments: message.attachments as AttachmentEntity[],
              },
            },
          }),
        )
      }

      // Broadcast and send
      await Promise.all(promises)

      revalidateTag(`chatbots:${chatbotId}:conversations`)
    },
  )
