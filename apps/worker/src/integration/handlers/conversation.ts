import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { MessageEventType } from "@chatbotx.io/flow-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobContactMarkAsRead,
} from "@chatbotx.io/worker-config"

export const contactMarkAsRead = async (
  props: IntegrationJobContactMarkAsRead["data"],
) => {
  const { sourceConversationId, integrationType } = props

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      sourceId: sourceConversationId,
      channel: integrationType,
    },
    with: {
      conversation: true,
    },
  })
  if (!contactInbox) {
    throw new Error("Contact inbox not found")
  }

  await db
    .update(conversationModel)
    .set({
      contactLastReadAt: new Date(),
    })
    .where(eq(conversationModel.id, contactInbox.conversation.id))

  await emit(MessageEventType["message:seen"], {
    context: {
      workspaceId: contactInbox.conversation.workspaceId,
      contactId: contactInbox.contactId,
      conversationId: contactInbox.conversation.id,
      contactInboxId: contactInbox.id,
      channel: integrationType,
    },
    action: {},
    occurredAt: new Date(),
  })
}

export const agentMarkAsRead = async (
  _props: IntegrationJobAgentMarkAsRead["data"],
) => {
  // TODO: Implement
}
