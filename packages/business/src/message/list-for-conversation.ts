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
import { logger } from "../logger"
import { resolveMediaUrl } from "../media"
import { HTTP_URL_RE } from "../utils"

async function presignAttachments<T extends { id: string; originPath: string }>(
  attachments: T[],
  context: { channel: string; workspaceId: string; messageCreatedAt: Date },
): Promise<Array<T & { url: string | null }>> {
  return await Promise.all(
    attachments.map(async (attachment) => {
      let url: string | null = null
      try {
        url = await resolveMediaUrl(
          {
            kind: "attachment",
            workspaceId: context.workspaceId,
            attachmentId: attachment.id,
            originPath: attachment.originPath,
            channel: context.channel,
            messageCreatedAt: context.messageCreatedAt,
          },
          (key) =>
            HTTP_URL_RE.test(key) ? key : uploader.getPresignedDownload(key),
        )
      } catch (err) {
        // One unresolvable attachment (bad key, signer/host failure) must not
        // reject the whole page; drop just this attachment's URL.
        logger.warn(
          {
            err,
            attachmentId: attachment.id,
            workspaceId: context.workspaceId,
          },
          "Failed to resolve attachment media URL; omitting",
        )
      }
      return { ...attachment, url }
    }),
  )
}

const loadContactInboxChannels = async (
  messages: readonly Pick<MessageWithAttachments, "contactInboxId">[],
  workspaceId: string,
): Promise<Map<string, string>> => {
  const contactInboxIds = [
    ...new Set(messages.map((message) => message.contactInboxId)),
  ]
  if (contactInboxIds.length === 0) {
    return new Map()
  }
  const contactInboxes = await contactInboxService.findManyByIds({
    workspaceId,
    ids: contactInboxIds,
  })
  return new Map(
    contactInboxes.map((contactInbox) => [
      contactInbox.id,
      contactInbox.channel,
    ]),
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
  const [conversation, repository] = await Promise.all([
    input.conversationId
      ? conversationService.findBy({
          where: { id: input.conversationId, workspaceId: input.workspaceId },
        })
      : null,
    createMessageRepository(),
  ])

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

  const channelByContactInboxId = await loadContactInboxChannels(
    result.data,
    input.workspaceId,
  )
  const data = await Promise.all(
    result.data.map(async (message) => ({
      ...message,
      attachments: await presignAttachments(message.attachments, {
        workspaceId: input.workspaceId,
        channel: channelByContactInboxId.get(message.contactInboxId) ?? "",
        messageCreatedAt: message.createdAt,
      }),
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
  const channelByContactInboxId = await loadContactInboxChannels(
    [message],
    workspaceId,
  )

  return {
    ...message,
    attachments: await presignAttachments(message.attachments, {
      workspaceId,
      channel: channelByContactInboxId.get(message.contactInboxId) ?? "",
      messageCreatedAt: message.createdAt,
    }),
  }
}

export async function findByIdWithUrls(input: {
  workspaceId: string
  id: string
  createdAt: Date
}): Promise<MessageWithPresignedAttachments> {
  const repository = await createMessageRepository()
  const message = await repository.findById({
    id: input.id,
    createdAt: input.createdAt,
    workspaceId: input.workspaceId,
  })

  if (!message) {
    throw notFoundException("Message not found")
  }
  const channelByContactInboxId = await loadContactInboxChannels(
    [message],
    input.workspaceId,
  )

  return {
    ...message,
    attachments: await presignAttachments(message.attachments, {
      workspaceId: input.workspaceId,
      channel: channelByContactInboxId.get(message.contactInboxId) ?? "",
      messageCreatedAt: message.createdAt,
    }),
  }
}
