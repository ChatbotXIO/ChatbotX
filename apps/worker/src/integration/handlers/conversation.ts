import { prisma } from "@aha.chat/database"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type {
  IntegrationJobAgentMarkAsRead,
  IntegrationJobAssignConversation,
  IntegrationJobContactMarkAsRead,
} from "@aha.chat/worker-config"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"

export const broadcastAssignConversation = async (
  props: IntegrationJobAssignConversation["data"],
) => {
  const { conversations } = props
  const { inbox } = await getInboxWithAuthFromInboxId(conversations[0].inboxId)

  await broadcastToChatbotParty(inbox.chatbotId, {
    eventType: RealtimeEventType.conversationAssigned,
    data: {
      conversationIds: conversations.map((c) => c.id),
      assignedUserId: conversations[0].assignedUserId,
      assignedInboxTeamId: conversations[0].assignedInboxTeamId,
    },
  })
}

export const contactMarkAsRead = async (
  props: IntegrationJobContactMarkAsRead["data"],
) => {
  const { sourceConversationId } = props

  await prisma.conversation.updateMany({
    where: {
      sourceId: sourceConversationId,
    },
    data: {
      contactLastSeenAt: new Date(),
    },
  })
}

export const agentMarkAsRead = async (
  _props: IntegrationJobAgentMarkAsRead["data"],
) => {
  // TODO: Implement
}
