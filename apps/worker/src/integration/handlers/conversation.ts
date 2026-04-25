import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { ConversationModel } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobContactMarkAsRead,
} from "@chatbotx.io/worker-config"
import { integrationService } from "../../services/integrations"

const BOT_DISABLE_DURATION_MS = 24 * 60 * 60 * 1000

export type ConversationStateScope = {
  workspaceId: string
  conversationIds: string[]
}

export async function disableConversationState(
  scope: ConversationStateScope,
): Promise<void> {
  await db
    .update(conversationModel)
    .set({
      botEnabled: false,
      botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
    })
    .where(
      and(
        eq(conversationModel.workspaceId, scope.workspaceId),
        inArray(conversationModel.id, scope.conversationIds),
      ),
    )
}

export async function enableConversationState(
  scope: ConversationStateScope,
): Promise<void> {
  await db
    .update(conversationModel)
    .set({
      botEnabled: true,
      botResumeAt: null,
    })
    .where(
      and(
        eq(conversationModel.workspaceId, scope.workspaceId),
        inArray(conversationModel.id, scope.conversationIds),
      ),
    )
}

export async function ensureConversationActive(
  conversation: ConversationModel,
): Promise<boolean> {
  if (conversation.botEnabled) {
    return true
  }

  if (!conversation.botResumeAt || conversation.botResumeAt > new Date()) {
    return false
  }

  await enableConversationState({
    workspaceId: conversation.workspaceId,
    conversationIds: [conversation.id],
  })

  return true
}

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
