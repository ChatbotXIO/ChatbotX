import { messageService } from "@chatbotx.io/business"
import { senderTypes } from "@chatbotx.io/database/partials"
import { resolveContactMessageWindow } from "./message-window"

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
