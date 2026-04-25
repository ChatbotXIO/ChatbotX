import type { ConversationModel } from "@chatbotx.io/database/types"
import { isPast } from "date-fns"

export const BOT_DISABLE_DURATION_MS = 24 * 60 * 60 * 1000

export function isConversationActive(
  conversation: Pick<ConversationModel, "botEnabled" | "botResumeAt">,
): boolean {
  if (conversation.botEnabled) {
    return true
  }

  if (!conversation.botResumeAt) {
    return false
  }

  return isPast(new Date(conversation.botResumeAt))
}
