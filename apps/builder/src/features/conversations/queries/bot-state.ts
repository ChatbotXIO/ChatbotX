import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type { ConversationModel } from "@chatbotx.io/database/types"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "../utils/bot-state"

type ConversationStateScope = {
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

  if (!isConversationActive(conversation)) {
    return false
  }

  await enableConversationState({
    workspaceId: conversation.workspaceId,
    conversationIds: [conversation.id],
  })

  return true
}
