"use server"

import { and, db, desc, eq, inArray } from "@aha.chat/database/client"
import { attachmentModel, messageModel } from "@aha.chat/database/schema"
import type { MessageModel } from "@aha.chat/database/types"
import type { AttachmentResource } from "@/features/attachments/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { getPaginationWithDefaults } from "@/lib/pagination"
import type { MessageCollection, MessageResource } from "../schemas"
import type {
  FindMessageSchema,
  ListMessagesRequest,
} from "../schemas/list-messages.schema"

export const listMessages = async (
  chatbotId: string,
  input: ListMessagesRequest,
): Promise<MessageCollection> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const where = [eq(messageModel.chatbotId, chatbotId)]
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
          acc[attachment.messageId] = [
            ...(acc[attachment.messageId] ?? []),
            attachment,
          ]
          return acc
        },
        {} as Record<string, AttachmentResource[]>,
      )
    })
    .then((attachments) => {
      return messages.map((message) => ({
        ...message,
        attachments: attachments[message.id] ?? [],
      }))
    })

  let nextCursor: string | null = null
  const prevCursor: string | null = null
  if (messagesWithAttachments.length === pagination.limit) {
    const lastMessage = messages.at(-1) as MessageModel
    nextCursor = lastMessage.id
  }

  return { data: messagesWithAttachments, nextCursor, prevCursor }
}

export const findMessage = async (
  input: FindMessageSchema,
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
