import { senderTypes } from "@chatbotx.io/database/partials"
import { messageService } from "@chatbotx.io/services"

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
