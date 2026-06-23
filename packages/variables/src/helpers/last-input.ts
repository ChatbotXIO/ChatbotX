import {
  contactInboxService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import { contentTypes } from "@chatbotx.io/database/partials"
import { getSafeSinceTime } from "@chatbotx.io/database/repositories"

export const getContactLastInput = async (
  contactId: string,
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

  const message = await messageService.findLatestIncomingMessage({
    conversationId: conversation.id,
    sinceTime,
    workspaceId: conversation.workspaceId,
  })
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

  const lastAt =
    await contactInboxService.findLatestLastIncomingMessageAtByContactId({
      contactId,
    })
  const sinceTime = getSafeSinceTime(lastAt, 365 * 24 * 60 * 60 * 1000)
  if (!sinceTime) {
    return null
  }

  const message = await messageService.findLatestIncomingMessage({
    conversationId: conversation.id,
    sinceTime,
    workspaceId: conversation.workspaceId,
  })

  return message?.contentType ?? null
}
