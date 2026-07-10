import { messageService } from "@chatbotx.io/business"
import { contentTypes } from "@chatbotx.io/database/partials"
import type { MessageWithAttachments } from "@chatbotx.io/database/repositories"
import type { ConversationModel } from "@chatbotx.io/database/types"
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
    return await toPublicStorageUrl(
      attachment.originPath,
      conversation.workspaceId,
    )
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
