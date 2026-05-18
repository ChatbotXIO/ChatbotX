import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import baseLogger from "@chatbotx.io/logger"
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
    const { workspaceId, conversationId, reason, source, channel, metadata } =
      request

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

      emit("analytics:dashboard", {
        eventType: "conversation:transferred_to_human",
        workspaceId,
        conversationId,
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
      }).catch((error) => {
        console.error("[disableBotAction] Failed to emit", error)
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
