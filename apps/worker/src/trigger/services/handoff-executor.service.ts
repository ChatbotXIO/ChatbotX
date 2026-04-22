import { conversationTrackingService } from "@chatbotx.io/analytics"
import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emitConversationTransferredToHuman } from "@chatbotx.io/events"
import baseLogger from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import { normalizeError } from "universal-error-normalizer"

export interface HandoffRequest {
  channel?: string
  contactId: string
  conversationId: string
  metadata?: Record<string, unknown>
  reason: string
  source: "ai_system_tool" | "automated_response" | "manual"
  workspaceId: string
}

export class HandoffExecutorService {
  async execute(request: HandoffRequest): Promise<void> {
    const {
      workspaceId,
      conversationId,
      contactId,
      reason,
      source,
      channel,
      metadata,
    } = request

    try {
      // 0. Check if already transferred to human (Idempotency)
      const currentConversation = await db.query.conversationModel.findFirst({
        where: {
          id: conversationId,
        },
        columns: {
          botEnabled: true,
        },
      })

      const contactInbox = await db.query.contactInboxModel.findFirst({
        where: {
          contactId,
        },
        columns: {
          channel: true,
        },
      })

      if (currentConversation && currentConversation.botEnabled === false) {
        return
      }

      const resolvedChannel = channel || contactInbox?.channel || "webchat"

      // 1. Disable bot for the conversation
      await db
        .update(conversationModel)
        .set({ botEnabled: false })
        .where(eq(conversationModel.id, conversationId))

      // 2. Emit event for real-time and webhooks
      await emitConversationTransferredToHuman(
        workspaceId,
        contactId,
        conversationId,
      ).catch((err) => {
        const normalizedError = normalizeError(err)
        baseLogger.error(
          { error: normalizedError, conversationId },
          "[handoff-executor] Failed to emit event",
        )
      })

      // 3. Track analytics
      await conversationTrackingService
        .trackEvent({
          eventId: createId(),
          workspaceId,
          conversationId,
          eventType: "conversation_transferred_to_human",
          channel: resolvedChannel,
          occurredAt: new Date(),
          metadata: {
            ...metadata,
            handoffReason: reason,
            triggerContext: {
              triggerSource: "worker",
              triggerHandler: "handoffExecutor",
              triggerType: source,
            },
          },
        })
        .catch((err) => {
          const normalizedError = normalizeError(err)
          baseLogger.error(
            { error: normalizedError, conversationId },
            "[handoff-executor] Failed to track analytics",
          )
        })
    } catch (error) {
      const normalizedError = normalizeError(error)
      baseLogger.error(
        { error: normalizedError, conversationId },
        "[handoff-executor] Handoff execution failed",
      )
      throw error
    }
  }
}

export const handoffExecutorService = new HandoffExecutorService()
