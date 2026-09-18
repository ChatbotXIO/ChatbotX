import {
  resolveWhatsappCallerName,
  sendToWorkspaceMember,
  whatsappVoipCallService,
  whatsappVoipSignalingService,
} from "@chatbotx.io/business"
import type { WhatsappCallHoursSnapshot } from "@chatbotx.io/database/partials"
import {
  integrationLookupRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  rejectCall,
  terminateCall,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import {
  RealtimeEventType,
  type RealtimeEventWhatsappCallOutboundAnswer,
  type RealtimeEventWhatsappCallTransportEnded,
  type RealtimeEventWhatsappCallTransportIncoming,
} from "@chatbotx.io/partysocket-config"
import { isWithinCallHours } from "@chatbotx.io/utils/whatsapp-call-hours"
import {
  WhatsappVoipSignalingJobAction,
  type WhatsappVoipSignalingJobData,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"
import { finalizeCallSideEffects } from "./shared/whatsapp-call-finalize"

type HandleConnectData = Extract<
  WhatsappVoipSignalingJobData,
  { type: typeof WhatsappVoipSignalingJobAction.handleConnect }
>["data"]

type ExpireIfUnansweredData = Extract<
  WhatsappVoipSignalingJobData,
  { type: typeof WhatsappVoipSignalingJobAction.expireIfUnanswered }
>["data"]

type HandleOutboundAnswerData = Extract<
  WhatsappVoipSignalingJobData,
  { type: typeof WhatsappVoipSignalingJobAction.handleOutboundAnswer }
>["data"]

type ExpireOutboundDialData = Extract<
  WhatsappVoipSignalingJobData,
  { type: typeof WhatsappVoipSignalingJobAction.expireOutboundDial }
>["data"]

/**
 * Thrown when this job runs before the `whatsappCallEvent` job has created the
 * row, so BullMQ retries (short backoff, within the answer deadline) instead of
 * dropping the call.
 */
class VoipCallRowNotReadyError extends Error {
  constructor(wacid: string) {
    super(`whatsapp-voip-call-row-not-ready: ${wacid}`)
    this.name = "VoipCallRowNotReadyError"
  }
}

const getCallRowOrThrow = async (wacid: string): Promise<WhatsappCallModel> => {
  const call = await whatsappCallRepository.findByWacid(wacid)
  if (!call) {
    throw new VoipCallRowNotReadyError(wacid)
  }
  return call
}

/**
 * Outbound counterpart of `getCallRowOrThrow`: looks up by `attemptId` (the row
 * is created pre-dial), then `wacid`.
 */
const getOutboundCallRowOrThrow = async (input: {
  attemptId: string
  wacid?: string
}): Promise<WhatsappCallModel> => {
  const byAttempt = await whatsappCallRepository.findByAttemptId(
    input.attemptId,
  )
  if (byAttempt) {
    return byAttempt
  }
  const byWacid = input.wacid
    ? await whatsappCallRepository.findByWacid(input.wacid)
    : undefined
  if (byWacid) {
    return byWacid
  }
  throw new VoipCallRowNotReadyError(input.wacid ?? input.attemptId)
}

/**
 * Narrows `endCall`'s status to what `finalizeEndedCall` accepts. With
 * `allowFromAccepted:false` only `rejected` and `failed` are reachable, but the
 * type cannot say so.
 */
const isReservedCallEndStatus = (
  status: WhatsappCallModel["status"],
): status is "rejected" | "failed" =>
  status === "rejected" || status === "failed"

type ResolvedVoipIntegration = {
  workspaceId: string
  auth: WhatsappAuthValue
  /** Local mirrors of Meta's calling settings — see `inboundCallRefusal`. */
  /**
   * `true` only when an admin enabled calling — see `resolveVoipIntegration`.
   */
  callingEnabled: boolean
  inboundCallsEnabled: boolean
  callHours: WhatsappCallHoursSnapshot | null
}

const resolveVoipIntegration = async (
  phoneNumberId: string,
): Promise<ResolvedVoipIntegration> => {
  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      "whatsapp",
      phoneNumberId,
    )
  return {
    workspaceId: inbox.workspaceId,
    auth: integrationRow.auth as WhatsappAuthValue,
    // Calling is off until an admin turns it on: a null mirror means "never
    // configured". The `calls` subscription is app-wide, so every number under
    // the platform app delivers call events — this column is the only per-
    // number gate on the inbound side. The sub-toggles default open (see
    // `readFlag`).
    callingEnabled: integrationRow.callingEnabled === true,
    inboundCallsEnabled: readFlag(integrationRow.inboundCallsEnabled),
    callHours: readCallHours(integrationRow.callHours),
  }
}

/**
 * `false` only when the column says so. For sub-toggles only, which are reached
 * once calling is explicitly on.
 */
const readFlag = (value: unknown): boolean => value !== false

const readCallHours = (value: unknown): WhatsappCallHoursSnapshot | null =>
  value && typeof value === "object"
    ? (value as WhatsappCallHoursSnapshot)
    : null

/**
 * Why an inbound call must not ring, or `null` when it may. Meta should stop
 * these itself, but a customer's app can lag a settings change by up to 7 days.
 * Closed at the master switch; after it, only an explicit opt-out or a valid
 * schedule refuses.
 */
export const inboundCallRefusal = (
  integration: ResolvedVoipIntegration,
  at: Date = new Date(),
): "callingDisabled" | "inboundMuted" | "outsideCallHours" | null => {
  if (!integration.callingEnabled) {
    return "callingDisabled"
  }
  if (!integration.inboundCallsEnabled) {
    return "inboundMuted"
  }
  return isWithinCallHours(integration.callHours, at)
    ? null
    : "outsideCallHours"
}

/**
 * Outbound counterpart of `resolveVoipIntegration`: the expiry job has no
 * `phoneNumberId`, only the row's `inboxId`.
 */
export const resolveVoipAuthByInboxId = async (
  inboxId: string,
): Promise<WhatsappAuthValue> => {
  const row = await integrationLookupRepository.findAuthByInboxId({
    modelName: "IntegrationWhatsapp",
    inboxId,
  })
  if (!row) {
    throw new Error(
      `Whatsapp VoIP: no IntegrationWhatsapp row for inboxId ${inboxId}`,
    )
  }
  return row.auth as WhatsappAuthValue
}

/**
 * Best-effort DB finalize for a call ended out of band; a missing row is
 * logged, not fatal.
 */
const finalizeEndedCall = async (input: {
  wacid: string
  status: "rejected" | "failed"
}): Promise<void> => {
  const call = await whatsappCallRepository.findByWacid(input.wacid)
  if (!call) {
    logger.warn(
      { wacid: input.wacid, status: input.status },
      "Whatsapp VoIP: no call row to finalize on end",
    )
    return
  }
  await finalizeCallSideEffects({
    call,
    entity: {
      type: "whatsapp_call",
      direction: call.direction,
      status: input.status,
    },
  })
}

/**
 * Best-effort Graph end followed by the DB finalize. A Graph failure is only
 * logged — our state is already terminal and Meta drops the leg on its own
 * timeout.
 */
const graphEndThenFinalize = async (input: {
  wacid: string
  auth: WhatsappAuthValue
  graphAction: "reject" | "terminate"
  status: "rejected" | "failed"
}): Promise<void> => {
  const graphCall = input.graphAction === "reject" ? rejectCall : terminateCall
  try {
    await graphCall({ auth: input.auth, callId: input.wacid })
  } catch (err) {
    logger.warn(
      { err, wacid: input.wacid, action: input.graphAction },
      "Whatsapp VoIP: Graph end action failed",
    )
  }
  await finalizeEndedCall({ wacid: input.wacid, status: input.status })
}

/**
 * Meta-rejects a connect that has no control record (nobody was ever rung).
 * There is nothing to CAS, so go straight to Graph.
 */
const rejectUnreachableCall = (input: {
  wacid: string
  auth: WhatsappAuthValue
}): Promise<void> =>
  graphEndThenFinalize({ ...input, graphAction: "reject", status: "rejected" })

/**
 * Ends a call that has a control but never reached `accepted`. The Redis CAS to
 * `terminated` commits before the Graph call, so a racing browser accept loses;
 * `endCall` picks reject vs terminate from the phase. Returns whether this call
 * did the work, so other callers can tell "handled" from "nothing to do".
 */
export const endReservedCall = async (input: {
  wacid: string
  auth: WhatsappAuthValue
}): Promise<boolean> => {
  const ended = await whatsappVoipCallService.endCall({
    wacid: input.wacid,
    allowFromAccepted: false,
  })
  if (!ended) {
    // Lost the race, or no control record — nothing to do.
    return false
  }
  if (!isReservedCallEndStatus(ended.terminalStatus)) {
    logger.warn(
      { wacid: input.wacid, terminalStatus: ended.terminalStatus },
      "Whatsapp VoIP: unexpected terminalStatus from endCall on the expiry/reject path",
    )
    return false
  }
  await graphEndThenFinalize({
    wacid: input.wacid,
    auth: input.auth,
    graphAction: ended.graphAction,
    status: ended.terminalStatus,
  })
  return true
}

/**
 * The row's terminal status as the ended event carries it, or `null` while
 * live.
 */
const endedStatusOf = (
  call: WhatsappCallModel,
): RealtimeEventWhatsappCallTransportEnded["data"]["status"] | null =>
  whatsappVoipCallService.isCallEnded(call)
    ? // `isCallEnded` holds exactly for the statuses this event carries.
      (call.status as RealtimeEventWhatsappCallTransportEnded["data"]["status"])
    : null

/**
 * Delivers the offer to every rung agent. `sendToWorkspaceMember` never throws,
 * so a falsy result is the failure signal.
 */
const ringAgents = async (input: {
  workspaceId: string
  targets: string[]
  event: RealtimeEventWhatsappCallTransportIncoming
}): Promise<void> => {
  await Promise.all(
    input.targets.map(async (userId) => {
      const result = await sendToWorkspaceMember(
        { workspaceId: input.workspaceId, userId },
        input.event,
      )
      if (!result) {
        logger.warn(
          { wacid: input.event.data.wacid, userId },
          "Whatsapp VoIP: unable to deliver the offer realtime event",
        )
      }
    }),
  )
}

/**
 * If the caller hung up while the offer was in flight, the ended event may have
 * gone out before the ring. Re-read the row after delivery and re-send the
 * ended event; the client ignores duplicates.
 */
const notifyRungAgentsIfEnded = async (input: {
  wacid: string
  workspaceId: string
  targets: string[]
}): Promise<void> => {
  const latest = await whatsappCallRepository.findByWacid(input.wacid)
  const status = latest ? endedStatusOf(latest) : null
  if (!(latest && status)) {
    return
  }
  const event: RealtimeEventWhatsappCallTransportEnded = {
    eventType: RealtimeEventType.whatsappCallTransportEnded,
    data: {
      transport: "voip",
      whatsappCallId: latest.id,
      wacid: input.wacid,
      status,
    },
  }
  await Promise.all(
    input.targets.map((userId) =>
      sendToWorkspaceMember({ workspaceId: input.workspaceId, userId }, event),
    ),
  )
}

/**
 * Refuses an inbound connect this worker will not ring. Claims the call first
 * (`claimUnreachable`, `SET NX`) so no agent can claim it between our read and
 * the reject; if the claim is lost, `endReservedCall`'s fenced CAS ends it if
 * still `reserved`.
 */
const refuseIncomingCall = async (input: {
  wacid: string
  auth: WhatsappAuthValue
  deadlineAt: number
}): Promise<void> => {
  const claimed = await whatsappVoipCallService.claimUnreachable({
    wacid: input.wacid,
    deadlineAt: input.deadlineAt,
  })
  if (claimed) {
    await rejectUnreachableCall({ wacid: input.wacid, auth: input.auth })
    return
  }
  await endReservedCall({ wacid: input.wacid, auth: input.auth })
}

/**
 * Safety net for a `handleConnect` job that exhausted its retries (usually
 * because the row never appeared). Its control already exists, so finalize the
 * call now instead of leaving it `ringing` for the sweeper. Called from the
 * queue's `failed` listener, so it must never throw.
 */
export const finalizeExhaustedHandleConnect = async (
  data: HandleConnectData,
): Promise<void> => {
  try {
    const { auth } = await resolveVoipIntegration(data.phoneNumberId)
    await refuseIncomingCall({
      wacid: data.wacid,
      auth,
      deadlineAt: data.deadlineAt,
    })
  } catch (err) {
    logger.error(
      { err, wacid: data.wacid },
      "Whatsapp VoIP: unable to finalize a call whose handleConnect retries were exhausted; the 5-minute stale-call sweep remains the backstop",
    )
  }
}

const handleConnect = async (data: HandleConnectData): Promise<void> => {
  const { wacid, deadlineAt, phoneNumberId, receivedAt } = data

  // The terminate that ended this call found nothing to clean up — check before
  // anything else.
  const existing = await whatsappCallRepository.findByWacid(wacid)
  if (existing && whatsappVoipCallService.isCallEnded(existing)) {
    await whatsappVoipSignalingService.deleteOffer(wacid)
    logger.info(
      { wacid, status: existing.status },
      "Whatsapp VoIP: connect for a call that already ended; not ringing",
    )
    return
  }

  // A redelivered connect for a call already claimed or answered does nothing.
  const control = await whatsappVoipCallService.readControl(wacid)
  if (control && control.phase !== "reserved") {
    logger.info(
      { wacid, phase: control.phase },
      "Whatsapp VoIP: connect for a call that is no longer ringing; ignoring",
    )
    return
  }

  const integration = await resolveVoipIntegration(phoneNumberId)
  const { workspaceId, auth } = integration

  // Refused before the offer is read when calling is off, inbound is muted, or
  // it is outside call hours — rejected so the customer stops hearing ringing.
  // Judged against the webhook's arrival time, so a queue backlog cannot push a
  // call out of hours.
  const refusal = inboundCallRefusal(integration, new Date(receivedAt))
  if (refusal) {
    logger.info(
      { wacid, workspaceId, refusal },
      "Whatsapp VoIP: inbound call refused by this number's calling settings",
    )
    await refuseIncomingCall({ wacid, auth, deadlineAt })
    return
  }

  // No stored offer (unprocessable SDP or expired) — reject before ringing
  // anyone.
  const offer = await whatsappVoipSignalingService.readOffer(wacid)
  if (!offer) {
    await refuseIncomingCall({ wacid, auth, deadlineAt })
    return
  }

  // Create (or observe) the control before any retryable read, so a retry can
  // never leave a call without one. `SET NX`, safe to retry.
  const reservation = await whatsappVoipCallService.reserveIncomingCall({
    wacid,
    deadlineAt,
  })
  if (reservation.status === "alreadyProgressed") {
    // Already past `reserved` — never re-ring or terminate.
    return
  }

  // The row comes from the sibling `whatsappCallEvent` job and often does not
  // exist yet. Target selection needs its `conversationId`, so throw and let
  // BullMQ retry the whole job; the control above is reused. If retries run
  // out, the `expireIfUnanswered` job still rejects the call.
  const conversationId =
    existing?.conversationId ?? (await getCallRowOrThrow(wacid)).conversationId

  const selection = await whatsappVoipCallService.selectRingTargetsForCall({
    workspaceId,
    conversationId,
  })

  if (selection.userIds.length === 0) {
    // Nobody eligible to ring. The control already exists (so
    // `claimUnreachable` would lose) — end it via the fenced CAS.
    await endReservedCall({ wacid, auth })
    return
  }
  const targets = [...selection.userIds]

  // Re-read: a terminate may have finalized while targets were being selected.
  const call = await getCallRowOrThrow(wacid)

  if (whatsappVoipCallService.isCallEnded(call)) {
    // Terminated during selection. If that finalize ran before our reservation,
    // end the control here — no Meta call, no re-finalize.
    await whatsappVoipCallService.endCall({ wacid, allowFromAccepted: false })
    await whatsappVoipSignalingService.deleteOffer(wacid)
    return
  }

  await ringAgents({
    workspaceId,
    targets,
    event: {
      eventType: RealtimeEventType.whatsappCallTransportIncoming,
      data: {
        transport: "voip",
        whatsappCallId: call.id,
        wacid,
        direction: call.direction,
        conversationId: call.conversationId,
        contactInboxId: call.contactInboxId,
        contactName: await resolveWhatsappCallerName(call),
        offer: { sdpType: "offer", sdp: offer.sdp },
        deadlineAt: new Date(deadlineAt).toISOString(),
      },
    },
  })
  await notifyRungAgentsIfEnded({ wacid, workspaceId, targets })
  // `expireIfUnanswered` is scheduled at the webhook boundary, so the deadline
  // never depends on this job finishing.
}

/**
 * Durable deadline enforcement. No-op once accepted or terminated;
 * `endReservedCall` re-checks atomically so a just-accepted call is never
 * downgraded.
 */
const handleExpire = async (data: ExpireIfUnansweredData): Promise<void> => {
  const { wacid, phoneNumberId } = data
  const control = await whatsappVoipCallService.readControl(wacid)
  if (
    !control ||
    control.phase === "accepted" ||
    control.phase === "terminated"
  ) {
    return
  }

  const { auth } = await resolveVoipIntegration(phoneNumberId)
  await endReservedCall({ wacid, auth })
}

/**
 * Forwards the customer's SDP answer to the initiating agent only. Read once,
 * never logged, then deleted so a redelivery is a no-op.
 */
const handleOutboundAnswer = async (
  data: HandleOutboundAnswerData,
): Promise<void> => {
  const { attemptId, wacid, workspaceId } = data
  const call = await getOutboundCallRowOrThrow({ attemptId, wacid })

  const answer =
    await whatsappVoipSignalingService.readOutboundAnswer(attemptId)
  if (!answer) {
    logger.warn(
      { attemptId, whatsappCallId: call.id },
      "Whatsapp VoIP outbound answer: no stored answer found (already consumed)",
    )
    return
  }

  const initiatorUserId = call.answeredByUserId
  if (!initiatorUserId) {
    logger.warn(
      { attemptId, whatsappCallId: call.id },
      "Whatsapp VoIP outbound answer: call row has no initiator; dropping",
    )
    return
  }

  const eventData: RealtimeEventWhatsappCallOutboundAnswer["data"] = {
    whatsappCallId: call.id,
    wacid: call.wacid ?? wacid ?? "",
    attemptId,
    session: { sdpType: "answer", sdp: answer.sdp },
  }

  const result = await sendToWorkspaceMember(
    { workspaceId, userId: initiatorUserId },
    {
      eventType: RealtimeEventType.whatsappCallOutboundAnswer,
      data: eventData,
    },
  )
  if (!result) {
    logger.warn(
      { attemptId, userId: initiatorUserId },
      "Whatsapp VoIP: unable to deliver the outbound answer realtime event",
    )
  }

  await whatsappVoipSignalingService.deleteOutboundAnswer(attemptId)
}

/**
 * Fallback when the control is already gone (lost race, Redis flush) so a no-
 * answer dial is never stranded. Re-reads the row and ends it only if still
 * exactly `ringing` — never an answered or ended call.
 */
const forceEndNoAnswerOutboundDial = async (input: {
  wacid: string
  auth: WhatsappAuthValue
}): Promise<void> => {
  const call = await whatsappCallRepository.findByWacid(input.wacid)
  if (call?.status !== "ringing") {
    return
  }
  await graphEndThenFinalize({
    wacid: input.wacid,
    auth: input.auth,
    graphAction: "terminate",
    status: "failed",
  })
}

/**
 * Outbound counterpart of `expireIfUnanswered`: ends a dial not accepted by the
 * deadline via `endReservedCall`, falling back to
 * `forceEndNoAnswerOutboundDial` if the control is gone. Auth comes from the
 * row's `inboxId`.
 */
const handleExpireOutboundDial = async (
  data: ExpireOutboundDialData,
): Promise<void> => {
  const call = await getOutboundCallRowOrThrow({
    attemptId: data.attemptId,
    wacid: data.wacid,
  })

  const wacid = call.wacid ?? data.wacid
  if (!wacid) {
    logger.warn(
      { attemptId: data.attemptId, whatsappCallId: call.id },
      "Whatsapp VoIP outbound expiry: call row has no wacid yet; cannot terminate",
    )
    return
  }

  const auth = await resolveVoipAuthByInboxId(call.inboxId)
  const handled = await endReservedCall({ wacid, auth })
  if (!handled) {
    await forceEndNoAnswerOutboundDial({ wacid, auth })
  }
}

export const handleWhatsappVoipSignalingJob = async (
  data: WhatsappVoipSignalingJobData,
): Promise<void> => {
  switch (data.type) {
    case WhatsappVoipSignalingJobAction.handleConnect:
      await handleConnect(data.data)
      return
    case WhatsappVoipSignalingJobAction.expireIfUnanswered:
      await handleExpire(data.data)
      return
    case WhatsappVoipSignalingJobAction.handleOutboundAnswer:
      await handleOutboundAnswer(data.data)
      return
    case WhatsappVoipSignalingJobAction.expireOutboundDial:
      await handleExpireOutboundDial(data.data)
      return
    default: {
      const _exhaustive: never = data
      logger.warn(
        { data: _exhaustive },
        "Unhandled whatsapp voip signaling job",
      )
    }
  }
}
