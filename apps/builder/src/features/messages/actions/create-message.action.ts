"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { findConversation } from "@/features/conversations/queries/get-conversations.query"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  ContentType,
  MessageType,
  prisma,
  SenderType,
  type User,
} from "@ahachat.ai/database"
import { uploader } from "@ahachat.ai/filesystem"
import { chatQueue, ChatJobAction } from "@ahachat.ai/worker-config"
import { revalidateTag } from "next/cache"
import {
  type CreateMessageRequest,
  createMessageRequest,
  guessFileTypeFromMimeType,
} from "../schemas/create-message.schema"
import type { MessageResource } from "../schemas/list-messages.schema"
import type { AttachmentResource } from "@/features/attachments/schemas/get-attachments.schema"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import { logger } from "@/lib/log"
import type {
  AttachmentEntity,
  ConversationEntity,
  ContentType as SdkContentType,
} from "@ahachat.ai/sdk"

export const createMessageAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(createMessageRequest)
  .action(
    async ({
      ctx,
      bindArgsParsedInputs: [chatbotId, conversationId],
      parsedInput,
    }: {
      ctx: { user: User }
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
        path = `public/workspaces/${ctx.user.workspaceId}/conversations/${conversationId}/${createId()}`

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
        const message: MessageResource = await tx.message.create({
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
        if (path && "files" in parsedInput) {
          // biome-ignore lint/style/noNonNullAssertion: <explanation>
          const file = parsedInput.files?.[0]!
          const mimeType = file.type as string
          const attachment = await tx.attachment.create({
            data: {
              messageId: message.id,
              chatbotId: message.chatbotId,
              conversationId: message.conversationId,
              originPath: path,
              name: file.name,
              mimeType: mimeType,
              size: file.size,
              fileType: guessFileTypeFromMimeType(mimeType),
              ...imageDimensions,
            },
          })

          message.attachments = [attachment as AttachmentResource]
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

        return message
      })

      // (message as MessageResource).clientId = parsedInput.clientId
      await chatQueue.add(ChatJobAction.SEND_MESSAGE, {
        type: ChatJobAction.SEND_MESSAGE,
        data: {
          conversation: conversation as ConversationEntity,
          message: {
            ...message,
            clientId: parsedInput.clientId,
            sourceId: message.sourceId || "",
            contentType: message.contentType as unknown as SdkContentType,
            content: message.content ?? "",
            attachments: message.attachments as AttachmentEntity[],
          },
        },
      })

      revalidateTag(`chatbots:${chatbotId}:conversations`)
    },
  )
