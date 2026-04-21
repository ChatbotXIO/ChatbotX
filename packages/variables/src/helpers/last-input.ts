import { contentTypes } from "@chatbotx.io/database/partials"
import { conversationService, messageService } from "@chatbotx.io/services"

export const getContactLastInput = async (
  contactId: string,
): Promise<string | null> => {
  const conversation = await conversationService.findBy({
    where: { contactId },
  })
  if (!conversation) {
    return null
  }

  const message = await messageService.findLatestIncomingMessage(
    conversation.id,
  )
  if (!message) {
    return null
  }

  if (message.contentType === contentTypes.enum.text) {
    return message.text
  }

  return "Attached File"
}

export const getContactLastInputType = async (
  contactId: string,
): Promise<string | null> => {
  const conversation = await conversationService.findBy({
    where: { contactId },
  })
  if (!conversation) {
    return null
  }

  const message = await messageService.findLatestIncomingMessage(
    conversation.id,
  )

  return message?.contentType ?? null
}
