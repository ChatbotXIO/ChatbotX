"use server"

import { and, db, desc, eq, inArray } from "@aha.chat/database/client"
import { attachmentModel, messageModel } from "@aha.chat/database/schema"
import type { MessageModel } from "@aha.chat/database/types"
import {
  getPaginationWithDefaults,
  getPublicUrl,
} from "@aha.chat/database/utils"
import type { AttachmentResource } from "@/features/attachments/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { encodeCursor } from "@/lib/pagination"
import type {
  FindMessageRequest,
  ListMessagesRequest,
  ListMessagesResponse,
} from "../schema/query"
import type { MessageResource } from "../schema/resource"

export const listMessages = async (
  input: ListMessagesRequest,
): Promise<ListMessagesResponse> => {
  // await assertCurrentUserCanAccessChatbot(chatbotId)
  const where = [eq(messageModel.chatbotId, input.chatbotId)]
  if (input.conversationId) {
    where.push(eq(messageModel.conversationId, input.conversationId))
  }

  const pagination = getPaginationWithDefaults(input)

  const messages = await db
    .select()
    .from(messageModel)
    .where(and(...where))
    .limit(pagination.limit)
    .orderBy(desc(messageModel.createdAt), desc(messageModel.id))

  if (messages.length === 0) {
    return { data: [], nextCursor: null, prevCursor: null }
  }

  const messageIds = messages.map((message) => message.id)
  const messagesWithAttachments = await db
    .select()
    .from(attachmentModel)
    .where(inArray(attachmentModel.messageId, messageIds))
    .then((attachments) => {
      return attachments.reduce(
        (acc, attachment) => {
          acc[attachment.messageId.toString()] = [
            ...(acc[attachment.messageId.toString()] ?? []),
            { ...attachment, url: getPublicUrl(attachment.originPath) },
          ]
          return acc
        },
        {} as Record<string, AttachmentResource[]>,
      )
    })
    .then((attachments) => {
      return messages.map((message) => ({
        ...message,
        attachments: attachments[message.id.toString()] ?? [],
      }))
    })

  let nextCursor: string | null = null
  const prevCursor: string | null = null
  if (messagesWithAttachments.length === pagination.limit) {
    const lastMessage = messages.at(-1) as MessageModel
    nextCursor = encodeCursor({
      direction: "prev",
      createdAt: lastMessage.createdAt,
      id: lastMessage.id,
    })
  }

  return { data: messagesWithAttachments, nextCursor, prevCursor }
}

export const findMessage = async (
  input: FindMessageRequest,
): Promise<MessageResource> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const message = await db.query.messageModel.findFirst({
    with: {
      attachments: true,
    },
    where: input,
  })

  if (!message) {
    throw new Error("Message not found")
  }

  return message as MessageResource
}
