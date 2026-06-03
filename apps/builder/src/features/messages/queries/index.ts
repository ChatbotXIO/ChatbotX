"use server"

import { resolvePlatformSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db } from "@chatbotx.io/database/client"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { endOfHour } from "date-fns"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor-pagination"
import type {
  FindMessageRequest,
  ListMessagesRequest,
  ListMessagesResponse,
} from "../schema/query"
import type { MessageResourceWithRelations } from "../schema/resource"

export const listMessages = async (
  input: ListMessagesRequest,
): Promise<ListMessagesResponse> => {
  const { storageUrl } = await resolvePlatformSettings({
    workspaceId: input.workspaceId,
  })

  const conversation = input.conversationId
    ? await db.query.conversationModel.findFirst({
        where: { id: input.conversationId },
      })
    : null

  const contactInbox = conversation
    ? await db.query.contactInboxModel.findFirst({
        where: { contactId: conversation.contactId },
        orderBy: { lastMessageAt: "desc" },
      })
    : null

  const repository = await createMessageRepository()
  const cursor = decodeCursor(input.cursor)

  const result = await repository.listByConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    sinceTime: getSafeSinceTime(conversation?.createdAt),
    pagination: {
      limit: input.perPage ?? 20,
      cursor: cursor
        ? {
            createdAt: cursor.createdAt,
            id: cursor.id,
            shardId: cursor.shardId,
          }
        : {
            createdAt: endOfHour(contactInbox?.lastMessageAt ?? new Date()),
            id: "",
          },
    },
  })

  if (result.data.length === 0) {
    return { data: [], nextCursor: null, prevCursor: null }
  }

  const messagesWithUrls = result.data.map((message) => ({
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: getPublicFileUrl(attachment.originPath, storageUrl),
    })),
  }))

  let nextCursor: string | null = null
  const prevCursor: string | null = null

  if (result.nextCursor) {
    nextCursor = encodeCursor({
      direction: "prev",
      createdAt: result.nextCursor.createdAt,
      id: result.nextCursor.id,
      shardId: result.nextCursor.shardId,
    })
  }

  return { data: messagesWithUrls, nextCursor, prevCursor }
}

export const findMessage = async (
  input: FindMessageRequest,
): Promise<MessageResourceWithRelations> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { storageUrl } = await resolvePlatformSettings({
    workspaceId: input.workspaceId,
  })

  const repository = await createMessageRepository()
  const message = await repository.findById(
    input.id,
    getSafeSinceTime(input.createdAt),
  )

  if (!message) {
    throw new Error("Message not found")
  }

  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: getPublicFileUrl(attachment.originPath, storageUrl),
    })),
  } as MessageResourceWithRelations
}
