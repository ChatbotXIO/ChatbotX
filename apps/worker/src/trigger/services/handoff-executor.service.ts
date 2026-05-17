import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq } from "@chatbotx.io/database/client"
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

const DEFAULT_CHANNEL = "webchat"

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
      // Atomic update acts as idempotency guard: only proceeds when bot is still enabled.
      // Using WHERE botEnabled = true eliminates the TOCTOU race between a separate check and update.
      const updated = await db
        .update(conversationModel)
        .set({ botEnabled: false })
        .where(
          and(
            eq(conversationModel.id, conversationId),
            eq(conversationModel.botEnabled, true),
          ),
        )
        .returning({ id: conversationModel.id })

      if (updated.length === 0) {
        return
      }

      const resolvedChannel = channel ?? DEFAULT_CHANNEL

      await emitConversationTransferredToHuman(
        workspaceId,
        contactId,
        conversationId,
      )

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
