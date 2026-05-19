import { conversationService, messageService } from "@chatbotx.io/business"
import { senderTypes } from "@chatbotx.io/database/partials"

export const listLastMessages = async (
  conversationId: string,
  limit: number,
  includeDetail = false,
): Promise<string> => {
  const messages = await messageService.listLastMessages({
    conversationId,
    limit,
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
  return listLastMessages(conversation.id, limit, includeDetail)
}
