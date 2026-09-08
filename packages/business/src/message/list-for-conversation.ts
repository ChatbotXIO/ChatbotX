import {
  createMessageRepository,
  getSafeSinceTime,
  type MessageWithAttachments,
  type PaginationCursor,
} from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import { endOfHour } from "date-fns"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { notFoundException } from "../errors"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"

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

async function presignAttachments<T extends { originPath: string }>(
  attachments: T[],
  storageUrl: string,
): Promise<Array<T & { url: string | null }>> {
  return await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      url: resolveAttachmentUrl(attachment.originPath, storageUrl)
        ? await uploader.getPresignedDownload(attachment.originPath)
        : attachment.originPath,
    })),
  )
}

export type ListForConversationInput = {
  workspaceId: string
  conversationId?: string
  contactInboxId?: string
  cursor?: PaginationCursor
  limit: number
}

export type MessageWithPresignedAttachments = Omit<
  MessageWithAttachments,
  "attachments"
> & {
  attachments: Array<
    MessageWithAttachments["attachments"][number] & { url: string | null }
  >
}

export type ListForConversationResult = {
  data: MessageWithPresignedAttachments[]
  nextCursor: PaginationCursor | null
}

export async function listForConversation(
  input: ListForConversationInput,
): Promise<ListForConversationResult> {
  const { storageUrl } = await resolveTenantSettings({
    workspaceId: input.workspaceId,
  })

  const conversation = input.conversationId
    ? await conversationService.findBy({
        where: { id: input.conversationId, workspaceId: input.workspaceId },
      })
    : null

  let contactInbox: Awaited<
    ReturnType<typeof contactInboxService.findByUncached>
  > | null = null
  if (conversation) {
    contactInbox = input.contactInboxId
      ? await contactInboxService.findByUncached({
          where: {
            contactId: conversation.contactId,
            id: input.contactInboxId,
          },
        })
      : await contactInboxService.findRecentByContactId({
          workspaceId: input.workspaceId,
          contactId: conversation.contactId,
        })
  }

  const repository = await createMessageRepository()

  const result = await repository.listByConversation({
    workspaceId: input.workspaceId,
    contactInboxId: input.contactInboxId,
    conversationId: input.conversationId,
    sinceTime: getSafeSinceTime(conversation?.createdAt),
    pagination: {
      limit: input.limit,
      cursor: input.cursor ?? {
        createdAt: endOfHour(contactInbox?.lastMessageAt ?? new Date()),
        id: "",
      },
    },
  })

  if (result.data.length === 0) {
    return { data: [], nextCursor: null }
  }

  const data = await Promise.all(
    result.data.map(async (message) => ({
      ...message,
      attachments: await presignAttachments(message.attachments, storageUrl),
    })),
  )

  return { data, nextCursor: result.nextCursor }
}

export async function findForContact(input: {
  messageId: string
  conversationId: string
  workspaceId: string
}): Promise<MessageWithPresignedAttachments> {
  const { messageId, conversationId, workspaceId } = input
  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  const repository = await createMessageRepository()
  const conversation = await conversationService.findBy({
    where: { id: conversationId, workspaceId },
  })
  if (!conversation) {
    throw notFoundException("Message not found")
  }
  const message = await repository.findTriggerMessage({
    id: messageId,
    conversationId,
    workspaceId,
    sinceTime:
      getSafeSinceTime(conversation.createdAt) ?? conversation.createdAt,
    requireCompleteResults: true,
  })

  if (!message || message.conversationId !== conversationId) {
    throw notFoundException("Message not found")
  }

  return {
    ...message,
    attachments: await presignAttachments(message.attachments, storageUrl),
  }
}

export async function findByIdWithUrls(input: {
  workspaceId: string
  id: string
  createdAt: Date
}): Promise<MessageWithPresignedAttachments> {
  const { storageUrl } = await resolveTenantSettings({
    workspaceId: input.workspaceId,
  })

  const repository = await createMessageRepository()
  const message = await repository.findById({
    id: input.id,
    createdAt: input.createdAt,
    workspaceId: input.workspaceId,
  })

  if (!message) {
    throw notFoundException("Message not found")
  }

  return {
    ...message,
    attachments: await presignAttachments(message.attachments, storageUrl),
  }
}
