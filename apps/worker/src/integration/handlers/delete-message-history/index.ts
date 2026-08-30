import { aiContextStore } from "@chatbotx.io/ai/server"
import { conversationService } from "@chatbotx.io/business"
import { isMessageStorageError } from "@chatbotx.io/database/errors"
import { channelTypes } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import type { AIDeleteMessageHistorySchema } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"

export async function handleAIDeleteMessageHistory({
  conversation,
  contactInbox,
}: ExecuteStepProps<AIDeleteMessageHistorySchema>): Promise<ExecuteStepResult> {
  try {
    const repo = await createMessageRepository()
    await aiContextStore.runExclusive(conversation.id, async () => {
      await resetAIHistoryMarker({
        conversationId: conversation.id,
        workspaceId: conversation.workspaceId,
        lastMessageAt: contactInbox.lastMessageAt,
        repo,
      })

      if (conversation.sourceId === null) {
        return
      }

      const dmConversation = await conversationService.findDMByContact({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        channel: channelTypes.safeParse(contactInbox.channel).data,
      })

      if (!dmConversation || dmConversation.id === conversation.id) {
        return
      }

      await aiContextStore.runExclusive(dmConversation.id, async () => {
        await resetAIHistoryMarker({
          conversationId: dmConversation.id,
          workspaceId: dmConversation.workspaceId,
          lastMessageAt: contactInbox.lastMessageAt,
          repo,
        })
      })
    })

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        action: "aiDeleteMessageHistory",
      },
      "[ai-delete-message-history] Step failed",
    )
    if (isMessageStorageError(err)) {
      throw err
    }
    return { status: "error", errorMessage: error.message, result: null }
  }
}

async function resetAIHistoryMarker({
  conversationId,
  workspaceId,
  lastMessageAt,
  repo,
}: {
  conversationId: string
  workspaceId: string
  lastMessageAt: Date | null
  repo: Awaited<ReturnType<typeof createMessageRepository>>
}) {
  const narrowSinceTime = getSafeSinceTime(lastMessageAt) ?? new Date(0)
  let lastMessages = await repo.findLastByConversation(conversationId, {
    limit: 1,
    requireCompleteResults: true,
    sinceTime: narrowSinceTime,
    workspaceId,
  })

  if (lastMessages.length === 0 && lastMessageAt !== null) {
    lastMessages = await repo.findLastByConversation(conversationId, {
      limit: 1,
      requireCompleteResults: true,
      sinceTime: new Date(0),
      workspaceId,
    })
  }

  const lastMessage = lastMessages[0] ?? null

  await aiContextStore.delete(conversationId)
  await conversationService.updateAIContextLastMessageId({
    workspaceId,
    conversationId,
    messageId: lastMessage?.id ?? null,
  })
}
