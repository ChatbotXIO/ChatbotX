"use server"

import { prisma } from "@aha.chat/database"
import {
  ContentType,
  MessageType,
  SenderType,
  type UserModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import {
  broadcastToChatbotParty,
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import {
  type AttachmentEntity,
  type ConversationEntity,
  guessFileTypeFromMimeType,
} from "@aha.chat/sdk"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import type { AttachmentResource } from "@/features/attachments/schemas"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { findConversation } from "@/features/conversations/queries/list-conversations.query"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
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
      let path: string | null = null
      let imageDimensions: { width: number; height: number } | null = null
      if ("files" in parsedInput && parsedInput.files.length > 0) {
        const file = parsedInput.files[0] as File
        path = `public/conversations/${conversationId}/${createId()}`

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
        if (path && "files" in parsedInput && parsedInput.files?.[0]) {
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
