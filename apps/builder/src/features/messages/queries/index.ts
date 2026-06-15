"use server"

import { resolveTenantSettings } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { db } from "@chatbotx.io/database/client"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import { endOfHour } from "date-fns"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination/cursor-pagination"
import type {
  FindMessageRequest,
  ListMessagesRequest,
  ListMessagesResponse,
} from "../schema/query"
import type { MessageResourceWithRelations } from "../schema/resource"

/**
 * Coexist historical attachments stash a Graph URL or `wa-media:` sentinel in
 * `originPath` until the follow-up `coexistAttachmentDownload` job mirrors the
 * bytes to S3. Treat those as not-yet-downloaded and return `url=null` so the
 * UI shows a loading placeholder instead of a broken concatenated URL.
 */
const isPendingOriginPath = (originPath: string): boolean =>
  originPath.startsWith("http://") ||
  originPath.startsWith("https://") ||
  originPath.startsWith("wa-media:")

const resolveAttachmentUrl = (
  originPath: string,
  storageUrl: string,
): string | null =>
  isPendingOriginPath(originPath)
    ? null
    : getPublicFileUrl(originPath, storageUrl)

const presignAttachments = async <T extends { originPath: string }>(
  attachments: T[],
  storageUrl: string,
): Promise<Array<T & { url: string | null }>> =>
  Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      url: resolveAttachmentUrl(attachment.originPath, storageUrl)
        ? await uploader.getPresignedDownload(attachment.originPath)
        : attachment.originPath,
    })),
  )

export const listMessages = async (
  input: ListMessagesRequest,
): Promise<ListMessagesResponse> => {
  const { storageUrl } = await resolveTenantSettings({
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

  const messagesWithUrls = await Promise.all(
    result.data.map(async (message) => ({
      ...message,
      attachments:
        message.attachments.length > 0
          ? await presignAttachments(message.attachments, storageUrl)
          : message.attachments,
    })),
  )

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

export const publicFindContactMessage = async ({
  messageId,
  conversationId,
  workspaceId,
}: {
  messageId: string
  conversationId: string
  workspaceId: string
}): Promise<MessageResourceWithRelations> => {
  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  const repository = await createMessageRepository()
  const message = await repository.findById(messageId)

  if (!message || message.conversationId !== conversationId) {
    throw notFoundException("Message not found")
  }

  return {
    ...message,
    attachments: await presignAttachments(message.attachments, storageUrl),
  } as MessageResourceWithRelations
}

export const findMessage = async (
  input: FindMessageRequest,
): Promise<MessageResourceWithRelations> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { storageUrl } = await resolveTenantSettings({
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
    attachments: await presignAttachments(message.attachments, storageUrl),
  } as MessageResourceWithRelations
}
