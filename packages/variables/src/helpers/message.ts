import { messageService } from "@chatbotx.io/business"
import { type SenderType, senderTypes } from "@chatbotx.io/database/partials"
import { resolveContactMessageWindow } from "./message-window"

/**
 * Who sent a `{{chat_history_details}}` line: the contact is the "User", an
 * inbox agent the "Admin", and anything automated (flows, AI, API) the "Bot".
 */
export const senderLabel = (senderType: SenderType | null): string => {
  switch (senderType) {
    case senderTypes.enum.contact:
      return "User"
    case senderTypes.enum.user:
      return "Admin"
    default:
      return "Bot"
  }
}

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
      const sender = senderLabel(message.senderType)

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
  const window = await resolveContactMessageWindow(contactId)
  if (!window) {
    return null
  }

  const { conversation, sinceTime } = window

  return listLastMessages(
    conversation.id,
    conversation.workspaceId,
    limit,
    includeDetail,
    sinceTime,
  )
}
