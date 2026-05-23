"use server"

import { resolvePlatformSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db } from "@chatbotx.io/database/client"
import type { MessageModel } from "@chatbotx.io/database/types"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { z } from "zod"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
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

  // await assertCurrentUserCanAccessChatbot(workspaceId)
  const where: Record<string, unknown> = {
    workspaceId: input.workspaceId,
  }
  if (input.conversationId) {
    where.conversationId = input.conversationId
  }
  if (input.cursor) {
    const decodedCursor = decodeCursor(
      input.cursor,
      z.object({
        createdAt: z.coerce.date(),
        id: z.string(),
      }),
    )
    if (decodedCursor) {
      where.OR = [
        {
          createdAt: { lt: decodedCursor.createdAt },
        },
        {
          createdAt: { eq: decodedCursor.createdAt },
          id: { gt: decodedCursor.id },
        },
      ]
    }
  }

  const pagination = getPaginationWithDefaults(input)

  const messages = await db.query.messageModel
    .findMany({
      where,
      with: {
        attachments: true,
      },
      limit: pagination.limit + 1,
      orderBy: {
        createdAt: "desc",
        id: "desc",
      },
    })
    .then((messages) =>
      messages.map((message) => {
        if (message.attachments.length > 0) {
          return {
            ...message,
            attachments: message.attachments.map((attachment) => ({
              ...attachment,
              url: getPublicFileUrl(attachment.originPath, storageUrl),
            })),
          }
        }

        return message
      }),
    )

  let nextCursor: string | null = null
  const prevCursor: string | null = null
  const items = messages.slice(0, pagination.limit)
  if (messages.length > pagination.limit) {
    const lastMessage = messages.at(-1) as MessageModel
    nextCursor = encodeCursor({
      direction: "prev",
      createdAt: lastMessage.createdAt,
      id: lastMessage.id,
    })
  }

  return { data: items, nextCursor, prevCursor }
}

export const findMessage = async (
  input: FindMessageRequest,
): Promise<MessageResourceWithRelations> => {
  const { storageUrl } = await resolvePlatformSettings({
    workspaceId: input.workspaceId,
  })

  const message = await db.query.messageModel.findFirst({
    with: {
      attachments: true,
    },
    where: input,
  })

  if (!message) {
    throw new Error("Message not found")
  }

  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: getPublicFileUrl(attachment.originPath, storageUrl),
    })),
  }
}
