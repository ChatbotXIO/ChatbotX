import { emitConversationAssigned } from "@chatbotx.io/events"
import type { IntegrationJobAssignConversation } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

export const assignConversation = async (
  props: IntegrationJobAssignConversation["data"],
) => {
  const { conversations } = props

  if (!conversations || conversations.length === 0) {
    return
  }

  for (const conversation of conversations) {
    if (!conversation.assignedUserId) {
      continue
    }

    try {
      await emitConversationAssigned(
        conversation.workspaceId,
        conversation.contactId,
        conversation.id,
        conversation.assignedUserId,
      )
    } catch (error) {
      const normalizedError = normalizeError(error)
      logger.error(
        {
          error: normalizedError,
          conversationId: conversation.id,
        },
        "[worker] Failed to emit conversation assignment event",
      )
    }
  }
}
