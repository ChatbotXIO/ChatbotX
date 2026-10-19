import { conversationService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import { emit } from "@chatbotx.io/event-bus"
import { emitConversationTransferredToHuman } from "@chatbotx.io/events"
import baseLogger from "@chatbotx.io/logger"
import { normalizeError } from "universal-error-normalizer"

export interface HandoffRequest {
  channel?: string
  contactId: string
  conversationId: string
  inboxId?: string
  metadata?: Record<string, unknown>
  reason: string
  /**
   * True when the handoff reacts to the contact's message (AI tools, routers,
   * automated replies); false for events that can fire hours later such as a
   * thread-control handback.
   */
  reopenUnansweredHumanReplyWindow?: boolean
  source:
    | "ai_system_tool"
    | "automated_response"
    | "global_router"
    | "manual"
    | "thread_control_handback"
  workspaceId: string
}

export class HandoffExecutorService {
  async execute(
    request: HandoffRequest,
  ): Promise<{ status: "alreadyHandedOff" | "handedOff" }> {
    const {
      workspaceId,
      conversationId,
      reason,
      source,
      channel,
      inboxId,
      metadata,
      contactId,
    } = request

    try {
      // Atomic, workspace-scoped update acts as the idempotency guard: it only
      // proceeds when the bot is still enabled (no TOCTOU race).
      const handedOff = await conversationService.handOffIfBotEnabled({
        workspaceId,
        conversationId,
        reopenUnansweredHumanReplyWindow:
          request.reopenUnansweredHumanReplyWindow,
      })

      if (!handedOff) {
        return { status: "alreadyHandedOff" }
      }

      // Best-effort: the handoff is already committed, so a failed cancel must
      // not skip the transfer events (a retry would hit the botEnabled guard).
      try {
        await smartDelayService.cancelQuickReplyFollowUps({
          workspaceId,
          conversationIds: [conversationId],
        })
      } catch (err) {
        baseLogger.warn(
          { err, conversationId },
          "[handoff-executor] Failed to cancel quick reply follow-ups",
        )
      }

      await emitConversationTransferredToHuman(
        workspaceId,
        contactId,
        conversationId,
      )

      emit("analytics:dashboard", {
        eventType: "conversation:transferred_to_human",
        workspaceId,
        conversationId,
        channel,
        inboxId,
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
      return { status: "handedOff" }
    } catch (error) {
      const normalizedError = normalizeError(error)
      baseLogger.error(
        { err: normalizedError, conversationId },
        "[handoff-executor] Handoff execution failed",
      )
      throw error
    }
  }
}

export const handoffExecutorService = new HandoffExecutorService()
