import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit, MessageEventType } from "@chatbotx.io/event-bus"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobContactMarkAsRead,
} from "@chatbotx.io/worker-config"

export const contactMarkAsRead = async (
  props: IntegrationJobContactMarkAsRead["data"],
) => {
  const { contact, integrationType } = props

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      sourceId: contact.sourceId,
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

  emit(MessageEventType.SEEN, {
    workspaceId: contactInbox.conversation.workspaceId,
    contactId: contactInbox.contactId,
    conversationId: contactInbox.conversation.id,
    channel: integrationType,
    occurredAt: new Date(),
  })
}

export const agentMarkAsRead = async (
  _props: IntegrationJobAgentMarkAsRead["data"],
) => {
  // TODO: Implement
}
