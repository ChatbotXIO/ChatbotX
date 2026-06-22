import { conversationService } from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobContactMarkAsRead,
} from "@chatbotx.io/worker-config"
import { integrationService } from "../../services/integrations"
import { normalizeEpochTimestamp } from "../utils/message"

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
  })
  if (!contactInbox) {
    throw new Error("Contact inbox not found")
  }

  const conversation = await conversationService.findDMByContact({
    workspaceId: inbox.workspaceId,
    contactId: contactInbox.contactId,
  })
  if (!conversation) {
    throw new Error("Conversation not found")
  }

  const seenAt = parseReadTimestamp(props.payload) ?? new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(conversationModel)
      .set({
        contactLastReadAt: seenAt,
      })
      .where(eq(conversationModel.id, conversation.id))

    await tx
      .update(contactInboxModel)
      .set({
        contactLastReadAt: seenAt,
      })
      .where(eq(contactInboxModel.id, contactInbox.id))
  })

  await emit(messageEventTypeSchema.enum["message:seen"], {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: contactInbox.contactId,
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      channel: integrationType,
    },
    action: {},
    occurredAt: seenAt,
  })
}

export const agentMarkAsRead = async (
  _props: IntegrationJobAgentMarkAsRead["data"],
) => {
  // TODO: Implement
}

const parseReadTimestamp = (payload: unknown): Date | null => {
  if (!(payload && typeof payload === "object")) {
    return null
  }

  const record = payload as Record<string, unknown>
  const entry = record.entry
  const firstEntry =
    Array.isArray(entry) && entry[0] && typeof entry[0] === "object"
      ? (entry[0] as Record<string, unknown>)
      : undefined
  const messaging = firstEntry?.messaging
  const messengerTimestamp =
    Array.isArray(messaging) && messaging[0] && typeof messaging[0] === "object"
      ? (messaging[0] as Record<string, unknown>).timestamp
      : undefined

  return normalizeEpochTimestamp(messengerTimestamp ?? record.timestamp)
}
