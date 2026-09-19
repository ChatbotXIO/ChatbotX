import {
  CALL_ASSIGNMENT_TRIGGER_HANDLERS,
  conversationService,
} from "@chatbotx.io/business"
import { logger } from "@/lib/log"

type CallAssignmentTrigger = keyof typeof CALL_ASSIGNMENT_TRIGGER_HANDLERS

/** One failure-log message per trigger, keyed instead of branched. */
const AUTO_ASSIGN_FAILURE_LOG_MESSAGE: Record<CallAssignmentTrigger, string> = {
  answered: "WhatsApp VoIP call: auto-assign on answer failed",
  dialed: "WhatsApp outbound dial: auto-assign failed",
}

/**
 * Best-effort auto-assign, shared by the inbound answer and outbound dial
 * actions. `conversationService.claimForCallAgent`'s guarded UPDATE ensures a
 * team-assigned conversation is never auto-claimed and a concurrent manual
 * assignment always wins. Skipped for a support session, whose synthetic
 * membership has no real WorkspaceMember row to assign to. Never throws;
 * await this last so a slow/failing claim never delays other agents.
 */
export async function claimConversationForCallAgent(input: {
  workspaceId: string
  conversationId: string
  agentUserId: string
  whatsappCallId: string
  trigger: CallAssignmentTrigger
  isSupportSession: boolean
}): Promise<void> {
  if (input.isSupportSession) {
    return
  }
  await conversationService
    .claimForCallAgent({
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      userId: input.agentUserId,
      triggerHandler: CALL_ASSIGNMENT_TRIGGER_HANDLERS[input.trigger],
    })
    .catch((err: unknown) => {
      logger.warn(
        { err, whatsappCallId: input.whatsappCallId },
        AUTO_ASSIGN_FAILURE_LOG_MESSAGE[input.trigger],
      )
    })
}
