import {
  whatsappVoipCallService,
  whatsappVoipSignalingService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  resolveWhatsappCallOutcome,
  resolveWhatsappCallTerminalOutcomePair,
} from "@chatbotx.io/database/partials"
import {
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  rejectCall,
  terminateCall,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { CALL_CANCELED_BY_BUSINESS_LAST_ERROR } from "@chatbotx.io/sdk"
import { getTranslations } from "next-intl/server"
import { logger } from "@/lib/log"

type EndVoipCallAsAgentInput = {
  whatsappCallId: string
  workspaceId: string
  userId: string
  /** Message for the best-effort Graph-failure warning. */
  graphFailureLog: string
}

/**
 * Shared hangup body for both agent-initiated callers (the server action and
 * the sendBeacon unload route). Meta-notify failures are swallowed — Meta
 * reclaims the leg on its own timeout. Returns false only when the control
 * was already terminal.
 */
export async function endVoipCallAsAgent(
  input: EndVoipCallAsAgentInput,
): Promise<boolean> {
  const t = await getTranslations()

  const call = await whatsappCallRepository.findById(input.whatsappCallId)
  if (!call || call.workspaceId !== input.workspaceId) {
    throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
  }

  // The agent ended an outbound call before it connected — mark it so the
  // terminate-webhook finalize renders "Cancelled call", not "No answer". Only
  // outbound: an agent ending an unanswered inbound call is a different
  // outcome.
  const isBusinessCancelBeforeAnswer = call.direction === "businessInitiated"

  // Without a control record naming the reserved agent, the row's own
  // initiator/answerer is the ownership check.
  const isCallOwner =
    call.initiatedByUserId === input.userId ||
    call.answeredByUserId === input.userId

  if (!call.wacid) {
    if (!isCallOwner) {
      throw new ChatbotXException(
        t("whatsapp.calls.errors.voipNotReservedAgent"),
      )
    }
    await whatsappVoipCallService.finalizeEndedCall({
      whatsappCallId: input.whatsappCallId,
      status: "failed",
      outcome: resolveWhatsappCallOutcome({
        status: "failed",
        canceledByBusiness: isBusinessCancelBeforeAnswer,
      }),
      endedAt: new Date(),
      ...(isBusinessCancelBeforeAnswer
        ? { lastError: CALL_CANCELED_BY_BUSINESS_LAST_ERROR }
        : {}),
    })
    return true
  }
  const { wacid } = call

  const control = await whatsappVoipCallService.readControl(wacid)
  const isReservedAgent = control
    ? control.reservedUserId === input.userId
    : isCallOwner
  if (!isReservedAgent) {
    throw new ChatbotXException(t("whatsapp.calls.errors.voipNotReservedAgent"))
  }

  const ended = control
    ? await whatsappVoipCallService.endCall({ wacid, allowFromAccepted: true })
    : whatsappVoipCallService.resolveEndOutcomeWithoutControl(call)
  if (!ended) {
    return false
  }

  const integration =
    await integrationWhatsappRepository.findByInboxIdForWorkspace({
      workspaceId: input.workspaceId,
      inboxId: call.inboxId,
    })
  if (!integration) {
    throw new ChatbotXException(t("whatsapp.calls.errors.notFound"))
  }

  const graphCall = ended.graphAction === "reject" ? rejectCall : terminateCall
  try {
    await graphCall({
      auth: integration.auth as WhatsappAuthValue,
      callId: wacid,
    })
  } catch (error) {
    logger.warn(
      {
        err: error,
        whatsappCallId: input.whatsappCallId,
        wacid,
        action: ended.graphAction,
      },
      input.graphFailureLog,
    )
  }

  const isFailedBusinessCancel =
    isBusinessCancelBeforeAnswer && ended.terminalStatus === "failed"
  await whatsappVoipCallService.finalizeEndedCall({
    whatsappCallId: input.whatsappCallId,
    ...resolveWhatsappCallTerminalOutcomePair({
      status: ended.terminalStatus,
      canceledByBusiness: isFailedBusinessCancel,
    }),
    endedAt: new Date(),
    // terminalStatus === "failed" here means the call never reached accepted —
    // the agent hung up while it was still ringing. An answered call's
    // terminalStatus is completed, so this never mislabels a real conversation
    // the agent simply ended.
    ...(isFailedBusinessCancel
      ? { lastError: CALL_CANCELED_BY_BUSINESS_LAST_ERROR }
      : {}),
  })
  await whatsappVoipSignalingService.deleteOffer(wacid)
  return true
}
