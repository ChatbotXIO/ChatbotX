"use server"

import { prisma } from "@aha.chat/database"
import {
  ContentType,
  MessageType,
  SenderType,
  type UserModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import { type UploadedFile, uploadMultipleFiles } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { AttachmentEntity, ConversationEntity } from "@aha.chat/sdk"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import type { AttachmentResource } from "@/features/attachments/schemas"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { findConversation } from "@/features/conversations/queries/list-conversations.query"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import type { MessageResource } from "../schemas"
import {
  type CreateMessageRequest,
  createMessageRequest,
} from "../schemas/create-message.schema"

export const createMessageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
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

      // upload file if exists
      let uploadedFiles: UploadedFile[] = []
      if ("files" in parsedInput && parsedInput.files.length > 0) {
        uploadedFiles = await uploadMultipleFiles(
          parsedInput.files,
          `public/chatbots/${chatbotId}/conversations/${conversation.id}`,
        )
      }

      const message = await prisma.$transaction(async (tx) => {
        const newMessage: MessageResource = await tx.message.create({
          data: {
            content: "content" in parsedInput ? parsedInput.content : null,
            messageType: MessageType.outgoing,
            chatbotId: conversation.chatbotId,
            conversationId,
            senderType: SenderType.user,
            senderId: ctx.user.id,
            inboxId: conversation.inboxId,
            contentType: ContentType.text,
          },
        })

        // create attachment if path exists
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
            id: conversationId,
          },
          data: {
            agentLastSeenAt: new Date(),
            lastActivityAt: new Date(),
            adminRepliedAt: new Date(),
          },
        })

        return newMessage
      })

      const promises: Promise<unknown>[] = [
        broadcastToChatbotParty(message.chatbotId, {
          eventType: RealtimeEventType.messageCreated,
          data: {
            ...message,
            clientId: parsedInput.clientId,
          },
        }),
      ]
      if (conversation.sourceId?.startsWith(WEBCHAT_SOURCE_PREFIX)) {
        promises.push(
          broadcastToGuestParty(conversation.sourceId, {
            eventType: RealtimeEventType.messageCreated,
            data: {
              ...message,
              clientId: parsedInput.clientId,
            },
          }),
        )
      } else {
        promises.push(
          chatQueue.add(ChatJobAction.sendExternalMessage, {
            type: ChatJobAction.sendExternalMessage,
            data: {
              conversation: conversation as ConversationEntity,
              message: {
                ...message,
                messageType: MessageType.outgoing,
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

      revalidateCacheTags(`chatbots:${chatbotId}:conversations`)
    },
  )
