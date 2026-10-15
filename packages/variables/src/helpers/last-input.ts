import { messageService } from "@chatbotx.io/business"
import { ensureAttachmentStored } from "@chatbotx.io/channel-registry/media-hydration"
import { contentTypes } from "@chatbotx.io/database/partials"
import type { MessageWithAttachments } from "@chatbotx.io/database/repositories"
import type { ConversationModel } from "@chatbotx.io/database/types"
import { logger } from "../logger"
import { resolveContactMessageWindow } from "./message-window"
import { toPublicStorageUrl } from "./storage-url"

type LatestInputMessage = {
  conversation: ConversationModel
  message: MessageWithAttachments
}

const findLatestInputMessage = async (
  contactId: string,
): Promise<LatestInputMessage | null> => {
  const window = await resolveContactMessageWindow(contactId)
  if (!window) {
    return null
  }

  const { conversation, sinceTime } = window
  const message = await messageService.findLatestIncomingMessageWithAttachments(
    {
      conversationId: conversation.id,
      sinceTime,
      workspaceId: conversation.workspaceId,
    },
  )
  if (!message) {
    return null
  }

  return { conversation, message }
}

// A lazily-ingested attachment is still a provider URL that expires: store it
// first so every flow step gets a durable URL. Variables never throw, so an
// attachment that is unavailable or not stored in time resolves to null.
const toStoredAttachmentUrl = async (
  attachment: MessageWithAttachments["attachments"][number],
  workspaceId: string,
): Promise<string | null> => {
  try {
    const stored = await ensureAttachmentStored({
      attachmentId: attachment.id,
      workspaceId,
      messageCreatedAt: attachment.messageCreatedAt,
      originPath: attachment.originPath,
    })
    return stored
      ? await toPublicStorageUrl(stored.originPath, workspaceId)
      : null
  } catch (err) {
    logger.warn(
      { err, attachmentId: attachment.id, workspaceId },
      "last_input: attachment could not be stored",
    )
    return null
  }
}

export const getContactLastInput = async (
  contactId: string,
): Promise<string | null> => {
  const latestInput = await findLatestInputMessage(contactId)
  if (!latestInput) {
    return null
  }

  const { conversation, message } = latestInput
  const attachment = message.attachments[0]
  if (attachment) {
    return await toStoredAttachmentUrl(attachment, conversation.workspaceId)
  }

  if (message.contentType === contentTypes.enum.text) {
    return message.text
  }

  return null
}

export const getContactLastInputType = async (
  contactId: string,
): Promise<string | null> => {
  const latestInput = await findLatestInputMessage(contactId)
  if (!latestInput) {
    return null
  }

  const { message } = latestInput

  return message.attachments[0]?.fileType ?? message.contentType
}
