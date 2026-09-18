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
 * Best-effort auto-assign (P3, plan D2), shared by the inbound answer and
 * outbound dial actions: claims the conversation for the agent only when it
 * is currently unassigned to both a user and a team —
 * `conversationService.claimForCallAgent`'s guarded UPDATE is the single
 * source of truth for that, so a team-assigned conversation is never
 * auto-claimed and a concurrent manual assignment always wins.
 *
 * Skipped entirely for a support session (D8): a super admin's synthetic
 * workspace membership (`docs/support-access.md`) has no real
 * `WorkspaceMember` row, so assigning the conversation to that id would
 * write an assignee no membership list, notification, or permission check
 * can resolve.
 *
 * Never throws and never changes the call's outcome — a claim failure is
 * logged (`{ err }`) and dropped. Callers should await this as the LAST
 * best-effort step, after any other best-effort side effect (e.g. the
 * "claimed elsewhere" broadcast) that other agents are waiting on, so a slow
 * or failing claim never delays them.
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
