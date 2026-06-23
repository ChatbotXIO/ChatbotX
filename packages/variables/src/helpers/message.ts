import {
  contactInboxService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import { senderTypes } from "@chatbotx.io/database/partials"
import { getSafeSinceTime } from "@chatbotx.io/database/repositories"

export const listLastMessages = async (
  conversationId: string,
  workspaceId: string,
  limit: number,
  includeDetail: boolean,
  sinceTime: Date,
): Promise<string> => {
  const messages = await messageService.listLastMessages({
    conversationId,
    limit,
    sinceTime,
    workspaceId,
  })

  return messages
    .map((message) => {
      const text = message.text ?? "Attached File"
      const sender =
        message.senderType === senderTypes.enum.user ? "User" : "Admin"

      if (includeDetail) {
        return `${sender}: ${text}`
      }

      return text
    })
    .join("\n")
}

export const getChatHistory = async (
  contactId: string,
  limit: number,
  includeDetail = false,
): Promise<string | null> => {
  const conversation = await conversationService.findBy({
    where: { contactId },
  })
  if (!conversation) {
    return null
  }

  const lastAt =
    await contactInboxService.findLatestLastIncomingMessageAtByContactId({
      contactId,
    })
  const sinceTime = getSafeSinceTime(lastAt, 365 * 24 * 60 * 60 * 1000)
  if (!sinceTime) {
    return null
  }

  return listLastMessages(
    conversation.id,
    conversation.workspaceId,
    limit,
    includeDetail,
    sinceTime,
  )
}
