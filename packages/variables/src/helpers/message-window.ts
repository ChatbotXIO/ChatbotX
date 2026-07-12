import { contactInboxService, conversationService } from "@chatbotx.io/business"
import { getSafeSinceTime } from "@chatbotx.io/database/repositories"
import type { ConversationModel } from "@chatbotx.io/database/types"

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

export type ContactMessageWindow = {
  conversation: ConversationModel
  sinceTime: Date
}

export const resolveContactMessageWindow = async (
  contactId: string,
): Promise<ContactMessageWindow | null> => {
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
  const sinceTime = getSafeSinceTime(lastAt, ONE_YEAR_MS)
  if (!sinceTime) {
    return null
  }

  return { conversation, sinceTime }
}
