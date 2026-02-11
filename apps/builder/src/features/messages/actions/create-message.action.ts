"use server"

import { prisma } from "@aha.chat/database"
import {
  ContentType,
  MessageType,
  SenderType,
  type UserModel,
} from "@aha.chat/database/types"
import { type UploadedFile, uploadMultipleFiles } from "@aha.chat/filesystem"
import type { OutgoingMessage } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
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

      revalidateCacheTags(`chatbots:${chatbotId}:conversations`)

      await integrationQueue.add(IntegrationJobAction.createMessage, {
        type: IntegrationJobAction.createMessage,
        data: {
          message: {
            ...(message as unknown as OutgoingMessage),
            clientId: parsedInput.clientId,
          },
        },
      })
    },
  )
