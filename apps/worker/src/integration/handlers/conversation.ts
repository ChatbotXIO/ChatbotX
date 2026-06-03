import { db, eq } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobContactMarkAsRead,
} from "@chatbotx.io/worker-config"
import { integrationService } from "../../services/integrations"

export const contactMarkAsRead = async (
  props: IntegrationJobContactMarkAsRead["data"],
) => {
  const { sourceConversationId, integrationType, integrationIdentifier } = props

  const dbIntegration =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const { inbox } = dbIntegration

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: {
      sourceId: sourceConversationId,
      channel: integrationType,
      inboxId: inbox.id,
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

  await emit(messageEventTypeSchema.enum["message:seen"], {
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
