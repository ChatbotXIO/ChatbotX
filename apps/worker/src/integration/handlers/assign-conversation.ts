import { emitConversationAssigned } from "@chatbotx.io/events"
import type { IntegrationJobAssignConversation } from "@chatbotx.io/worker-config"

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

    await emitConversationAssigned(
      conversation.workspaceId,
      conversation.contactId,
      conversation.id,
      conversation.assignedUserId,
    )
  }
}
