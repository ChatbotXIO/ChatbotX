import {
  resolveWhatsappCallerName,
  sendToWorkspaceMember,
  whatsappVoipCallService,
} from "@chatbotx.io/business"
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
  type RealtimeEventWhatsappCallTransportIncoming,
} from "@chatbotx.io/partysocket-config"
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
 * Thrown when this job races the generic `whatsappCallEvent` connect job
 * (same webhook batch, a different queue) that creates the `WhatsappCall`
 * row: BullMQ retries per `WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS` (short,
 * bounded backoff — never blows the answer deadline) instead of silently
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
 * Outbound counterpart of {@link getCallRowOrThrow}: the pending
 * `WhatsappCall` row is created pre-dial (`createPendingOutbound`), so
 * `attemptId` is always the primary lookup; `wacid` (once attached) is the
 * fallback for a job that only has it. Throws the same
 * {@link VoipCallRowNotReadyError} so BullMQ retries rather than dropping the
 * answer/expiry — the row should already exist by the time either job runs.
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
 * Narrows `endCall`'s `terminalStatus` (the full `WhatsappCallStatus` union)
 * to the two values `finalizeEndedCall` accepts. `endReservedCall` only ever
 * calls `endCall` with `allowFromAccepted:false`, so the phase->outcome table
 * in `whatsappVoipCallService.endCall` can only resolve to `rejected` (from
 * `reserved`), `failed` (from `answering`, or from the outbound `dialing`/
 * `ringing` phases via `expireOutboundDial`) here — `completed`/`ringing`/
 * `accepted` are unreachable at runtime, but the return type can't express
 * that, so this guard makes the narrowing explicit instead of an unchecked
 * cast.
 */
const isReservedCallEndStatus = (
  status: WhatsappCallModel["status"],
): status is "rejected" | "failed" =>
  status === "rejected" || status === "failed"

type ResolvedVoipIntegration = {
  workspaceId: string
  auth: WhatsappAuthValue
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
  }
}

/**
 * Outbound counterpart of {@link resolveVoipIntegration}: the outbound
 * expiry job (`expireOutboundDial`) has no `phoneNumberId` to resolve the
 * integration from (unlike the inbound signaling jobs), only the
 * `WhatsappCall` row's `inboxId` — so this resolves Graph auth directly from
 * the per-channel integration table by inbox instead.
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

/** Best-effort DB finalize for a call ended out-of-band; a not-yet-created row is logged, not fatal. */
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
 * Best-effort Graph end action (reject/terminate) followed by the DB finalize.
 * A Graph failure is logged, never thrown — our own state is already terminal
 * and Meta reclaims the leg on its own 30-60s timeout.
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
 * Meta-`reject`s a connect that has NO control record — no agent was ever
 * reserved (empty ring set). There is nothing to CAS-terminate, so the Redis
 * transition is skipped entirely; without this the old CAS-terminate-first
 * path returned early on the missing control and the call was NEVER rejected,
 * ringing until Meta's own timeout.
 */
const rejectUnreachableCall = (input: {
  wacid: string
  auth: WhatsappAuthValue
}): Promise<void> =>
  graphEndThenFinalize({ ...input, graphAction: "reject", status: "rejected" })

/**
 * Ends a call that DOES have a control record but never reached `accepted`
 * (offer expired before delivery, or the answer deadline passed). Ordering
 * follows contract #5 (`docs/whatsapp-calling-voip.md`): the Redis CAS to
 * `terminated` — via {@link whatsappVoipCallService.endCall} with
 * `allowFromAccepted:false`, so it can never downgrade a call that reached
 * `accepted` — commits BEFORE the Graph HTTP call. An in-flight browser
 * `accept` racing this always loses the CAS and this becomes a no-op. The
 * Graph action (reject vs terminate) is derived from the phase by `endCall`,
 * not hard-coded here. `finalizeCallSideEffects`'s own transport-tagged
 * cleanup (`endCall`/`deleteOffer`) redundantly no-ops afterward.
 *
 * Returns whether this call actually won the CAS and performed the Graph +
 * finalize side effects (`true`), vs. every no-op outcome (`false`: lost the
 * race, no control record, or an unexpected `terminalStatus`) — exported so
 * other callers (the outbound expiry no-answer fallback, the stale-call
 * sweeper) can tell "handled" apart from "nothing to do here" without
 * duplicating this phase→Graph-action logic.
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
    // Lost the race (browser accept just committed, or already terminated),
    // or there was no control record at all — nothing left to do.
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
 * `handleConnect` — rings EVERY eligible agent (ring-all, like the SIP
 * fork-dial): resolves the live ring set, then delivers the SDP offer to each
 * one's realtime connections. The fenced CAS in `claimForAnswer` lets only the
 * first to answer win. Rejects when nobody has the inbox open. The durable
 * expiry job is scheduled at the webhook boundary.
 */
const handleConnect = async (data: HandleConnectData): Promise<void> => {
  const { wacid, deadlineAt, phoneNumberId } = data
  const { workspaceId, auth } = await resolveVoipIntegration(phoneNumberId)

  // Offer FIRST, before ringing anyone: a connect with no stored offer is
  // either an unprocessable-SDP connect (deliberately never stored — see
  // `rejectUnprocessableConnect`) or one whose offer TTL lapsed. Either way it
  // must be Meta-rejected, and doing it here means no agent is ever rung for a
  // doomed call. There is no control record yet, so `rejectUnreachableCall`
  // (Graph reject + finalize, no CAS) is the right primitive.
  const offer = await whatsappVoipCallService.readOffer(wacid)
  if (!offer) {
    await rejectUnreachableCall({ wacid, auth })
    return
  }

  const ring = await whatsappVoipCallService.resolveRingTargets({
    wacid,
    workspaceId,
    deadlineAt,
  })

  if (ring.status === "alreadyProgressed") {
    // A redelivered/retried connect that landed after the call already
    // advanced past `reserved` — never re-ring, and never terminate (that
    // would downgrade a live/accepted call).
    return
  }
  if (ring.status === "noEligibleAgent") {
    await rejectUnreachableCall({ wacid, auth })
    return
  }

  // The generic `whatsappCallEvent` connect job (same webhook batch, the
  // shared `integration` queue) creates this row — resolveRingTargets above is
  // idempotent (SET NX-backed), so retrying the whole job on a race is safe.
  const call = await getCallRowOrThrow(wacid)

  const eventData: RealtimeEventWhatsappCallTransportIncoming["data"] = {
    transport: "voip",
    whatsappCallId: call.id,
    wacid,
    direction: call.direction,
    conversationId: call.conversationId,
    contactInboxId: call.contactInboxId,
    contactName: await resolveWhatsappCallerName(call),
    offer: { sdpType: "offer", sdp: offer.sdp },
    deadlineAt: new Date(deadlineAt).toISOString(),
  }

  // Fan out to every live agent; a per-recipient failure never blocks the
  // rest. `sendToWorkspaceMember` never throws (it catches internally and
  // returns `null` on failure), so a falsy result — not a try/catch — is
  // what surfaces a delivery failure here.
  await Promise.all(
    ring.targets.map(async (userId) => {
      const result = await sendToWorkspaceMember(
        { workspaceId, userId },
        {
          eventType: RealtimeEventType.whatsappCallTransportIncoming,
          data: eventData,
        },
      )
      if (!result) {
        logger.warn(
          { wacid, userId },
          "Whatsapp VoIP: unable to deliver the offer realtime event",
        )
      }
    }),
  )
  // The durable `expireIfUnanswered` job is scheduled at the webhook boundary
  // (in `captureConnectOffer`), not here — so deadline enforcement never
  // depends on this consumer running to completion.
}

/**
 * `expireIfUnanswered` — durable deadline enforcement. A
 * no-op once the call reached `accepted` (or is already `terminated`): the
 * cheap `readControl` guard here avoids the integration lookup for a call
 * that's already live/done, and `endCall({allowFromAccepted:false})` inside
 * {@link endReservedCall} re-checks atomically so a call that reaches
 * `accepted` between this read and the CAS is never downgraded. The Graph
 * action (reject for a never-claimed `reserved`, terminate once a handshake
 * may have started) is derived from the phase by `endCall`.
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
 * `handleOutboundAnswer` — forwards the user's SDP ANSWER
 * (webhook-delivered, stashed in Redis by `captureOutboundAnswer`) to the
 * initiating agent's own connections via the targeted, SDP-carrying
 * `whatsappCallOutboundAnswer` event. Never broadcast — this is the live
 * answer for exactly one agent's call. The SDP is read once from Redis and
 * NEVER logged; `deleteOutboundAnswer` runs after the forward attempt so a
 * redelivered job is a no-op (an absent answer here means an earlier
 * delivery already consumed it, not an error).
 */
const handleOutboundAnswer = async (
  data: HandleOutboundAnswerData,
): Promise<void> => {
  const { attemptId, wacid, workspaceId } = data
  const call = await getOutboundCallRowOrThrow({ attemptId, wacid })

  const answer = await whatsappVoipCallService.readOutboundAnswer(attemptId)
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

  await whatsappVoipCallService.deleteOutboundAnswer(attemptId)
}

/**
 * Fallback for a control record that is already gone. `startOutboundDial`
 * gives the control a TTL margin
 * (see `OUTBOUND_CONTROL_TTL_MARGIN_MS` in the business package) so it
 * normally outlives this very job — but a lost CAS race, a Redis flush, or
 * any other reason {@link endReservedCall} no-ops must never silently strand
 * a still-`ringing` outbound dial: the real Meta leg would then ring until
 * ITS OWN 30-60s timeout with nobody watching, and the agent's dock would
 * never clear. Re-reads the row (the one passed in may be stale by now) and
 * force-terminates ONLY when it is still exactly `ringing` — never `accepted`
 * (a live call) and never an already-terminal status — so this can only ever
 * end a no-answer dial, never downgrade one that answered or already ended.
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
 * `expireOutboundDial` — the outbound
 * counterpart of `expireIfUnanswered`: terminates+finalizes a dial the user
 * never accepted by the deadline. Tries {@link endReservedCall} first —
 * `endCall({allowFromAccepted:false})` already no-ops once the call reached
 * `accepted`/`terminated` (no separate `readControl` pre-check needed), and
 * its phase->outcome table already maps the outbound `dialing`/`ringing`
 * phases to `terminate`/`failed` — the same Graph-then-finalize path
 * `handleExpire` uses for inbound. When that no-ops (the control was already
 * gone — e.g. lost the race, or ran right at the TTL boundary),
 * {@link forceEndNoAnswerOutboundDial} still ends a genuinely no-answer
 * dial from the DB row's own status, so this job is never a silent no-op.
 * Auth is resolved from the call row's `inboxId` (no `phoneNumberId` on this
 * job's payload).
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
