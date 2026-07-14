import { conversationService } from "@chatbotx.io/business"
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
  // A contact can have multiple conversations (DM + comment threads) sharing
  // one ContactInbox, so pick the conversation the contact is actually active
  // in and anchor sinceTime on that same conversation's lastActivityAt —
  // otherwise the two can point at different conversations and the windowed
  // scan misses the real last message.
  const conversation = await conversationService.findLatestByContact({
    contactId,
  })
  if (!conversation) {
    return null
  }

  const sinceTime = getSafeSinceTime(
    conversation.lastActivityAt ?? conversation.createdAt,
    ONE_YEAR_MS,
  )
  if (!sinceTime) {
    return null
  }

  return { conversation, sinceTime }
}
