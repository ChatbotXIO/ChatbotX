import { whatsappVoipCallService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
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
 * The hangup shared body — both agent-initiated VoIP-hangup callers (the
 * server action and the `sendBeacon` unload route) are identical except for
 * the log wording. Verifies the caller is the reserved agent, advances the
 * fenced control to `terminated` (`endCall`, always allowed to end an
 * already-`accepted` call — ending a live call is the whole point of a
 * hangup), best-effort tells Meta with the Graph verb `endCall` reports for
 * the phase, finalizes the DB row with `endCall`'s own `terminalStatus`, and
 * drops the offer.
 *
 * The Graph call is best-effort: our own state (Redis + the DB write) is
 * already terminal and the browser tears its peer down regardless, so a failed
 * Graph action must not surface as an error — Meta reclaims the leg on its own
 * 30-60s timeout.
 *
 * Returns `true` when it actually ended a call, `false` when the control record
 * was already terminal (another path won first) — the caller reports the same
 * idempotent success either way, since the outcome the user wanted already holds.
 *
 * A row that exists in the workspace but has `wacid === null` has not been
 * dialed at Meta yet — either it's in the pre-dial cancel window (row
 * created, `connectCall` not yet attempted/succeeded), or it's the row this
 * same compensating cleanup left behind after `initiateOutboundVoipCallAction`
 * finalized it as `failed` post-connect. Neither case has anything to fence
 * via Redis or tell Meta about (there is no `wacid` to key a control record
 * or a Graph action on), so this finalizes the DB row directly and returns
 * `true` rather than throwing `callNotFound` — the row not having a `wacid`
 * yet is not the same as the row not existing.
 */
export async function endVoipCallAsAgent(
  input: EndVoipCallAsAgentInput,
): Promise<boolean> {
  const t = await getTranslations()

  const call = await whatsappCallRepository.findById(input.whatsappCallId)
  if (!call || call.workspaceId !== input.workspaceId) {
    throw new ChatbotXException(t("whatsapp.calls.errors.callNotFound"))
  }

  // The agent ended an OUTBOUND call before it connected — mark it so the
  // terminate-webhook finalize renders "Cancelled call", not "No answer"
  // (which would wrongly say the customer didn't pick up). Only outbound: an
  // agent ending an unanswered INBOUND call is a different outcome.
  const isBusinessCancelBeforeAnswer = call.direction === "businessInitiated"

  if (!call.wacid) {
    await whatsappVoipCallService.finalizeEndedCall({
      whatsappCallId: input.whatsappCallId,
      status: "failed",
      endedAt: new Date(),
      ...(isBusinessCancelBeforeAnswer
        ? { lastError: CALL_CANCELED_BY_BUSINESS_LAST_ERROR }
        : {}),
    })
    return true
  }
  const { wacid } = call

  const control = await whatsappVoipCallService.readControl(wacid)
  if (control && control.reservedUserId !== input.userId) {
    throw new ChatbotXException(t("whatsapp.calls.errors.voipNotReservedAgent"))
  }

  const ended = await whatsappVoipCallService.endCall({
    wacid,
    allowFromAccepted: true,
  })
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

  await whatsappVoipCallService.finalizeEndedCall({
    whatsappCallId: input.whatsappCallId,
    status: ended.terminalStatus,
    endedAt: new Date(),
    // `terminalStatus === "failed"` here means the call never reached
    // `accepted` — the agent hung up while it was still ringing. For an
    // answered call `terminalStatus` is `completed`, so this never mislabels a
    // real conversation the agent simply ended.
    ...(isBusinessCancelBeforeAnswer && ended.terminalStatus === "failed"
      ? { lastError: CALL_CANCELED_BY_BUSINESS_LAST_ERROR }
      : {}),
  })
  await whatsappVoipCallService.deleteOffer(wacid)
  return true
}
