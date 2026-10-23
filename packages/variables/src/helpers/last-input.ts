import {
  contactInboxService,
  messageService,
  resolveMediaUrl,
} from "@chatbotx.io/business"
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

// The media proxy URL of an attachment that could not be stored in time: it
// shows the provider's copy and finishes storing it, so a flow step still gets
// a working link instead of an empty value.
const toProxyAttachmentUrl = async (
  attachment: MessageWithAttachments["attachments"][number],
  message: MessageWithAttachments,
  workspaceId: string,
): Promise<string | null> => {
  const contactInbox = await contactInboxService.findBy({
    where: { id: message.contactInboxId },
  })
  if (!contactInbox) {
    return null
  }
  return await resolveMediaUrl(
    {
      kind: "attachment",
      attachmentId: attachment.id,
      workspaceId,
      originPath: attachment.originPath,
      channel: contactInbox.channel,
      messageCreatedAt: attachment.messageCreatedAt,
    },
    (key) => toPublicStorageUrl(key, workspaceId),
  )
}

// A lazily-ingested attachment is still a provider URL that expires: store it
// first so every flow step gets a durable URL. Variables never throw: an
// attachment that is gone resolves to null, one that is not stored in time to
// its media proxy URL.
const toStoredAttachmentUrl = async (
  attachment: MessageWithAttachments["attachments"][number],
  message: MessageWithAttachments,
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
      "last_input: attachment not stored in time; using its media proxy URL",
    )
  }
  try {
    return await toProxyAttachmentUrl(attachment, message, workspaceId)
  } catch (err) {
    logger.warn(
      { err, attachmentId: attachment.id, workspaceId },
      "last_input: attachment media proxy URL could not be built",
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
    return await toStoredAttachmentUrl(
      attachment,
      message,
      conversation.workspaceId,
    )
  }

  if (message.contentType === contentTypes.enum.text) {
    return message.text
  }

  return null
}

/**
 * The text of the contact's latest incoming message when that message is plain
 * text, never a media URL (unlike `getContactLastInput`). Backs
 * `{{last_text_input}}`.
 */
export const getContactLastTextInput = async (
  contactId: string,
): Promise<string | null> => {
  const latestInput = await findLatestInputMessage(contactId)
  if (!latestInput) {
    return null
  }

  const { message } = latestInput
  if (
    message.contentType === contentTypes.enum.text &&
    message.attachments.length === 0
  ) {
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
