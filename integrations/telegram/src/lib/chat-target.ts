import type { OutgoingContact } from "@chatbotx.io/sdk"
import type { TelegramChatTarget } from "../schema"

/**
 * Where a message to the contact goes: their chat, through the business
 * connection when the conversation came in through one (its
 * `channelConversationId`).
 */
export const chatTarget = (
  contact: Pick<OutgoingContact, "sourceId" | "sourceConversationId">,
): TelegramChatTarget => ({
  chat_id: contact.sourceId,
  ...(contact.sourceConversationId
    ? { business_connection_id: contact.sourceConversationId }
    : {}),
})
