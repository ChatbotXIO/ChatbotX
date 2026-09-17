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
  /** Local mirrors of Meta's calling settings — see `refuseInboundCall`. */
  /** `false` only when explicitly turned off — see `readFlag`. */
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
    // `integrationRow` is the channel-agnostic shape, so these WhatsApp-only
    // columns arrive untyped — read them defensively rather than casting. Each
    // falls back to the permissive value: a row we cannot read must never be
    // the reason a customer cannot get through.
    callingEnabled: readFlag(integrationRow.callingEnabled),
    inboundCallsEnabled: readFlag(integrationRow.inboundCallsEnabled),
    callHours: readCallHours(integrationRow.callHours),
  }
}

/**
 * `false` only when the column really says so. A missing or unreadable value
 * means "never mirrored" and defers to Meta, so a number that had calling
 * working before this column existed keeps working.
 */
const readFlag = (value: unknown): boolean => value !== false

const readCallHours = (value: unknown): WhatsappCallHoursSnapshot | null =>
  value && typeof value === "object"
    ? (value as WhatsappCallHoursSnapshot)
    : null

/**
 * Why an inbound call must not ring, or `null` when it may.
 *
 * Meta is supposed to stop these at the source, but its own docs say a
 * customer's app can take up to 7 days to pick up a settings change, and a
 * stale client can still place the call. Without this the business has no way
 * to enforce its own setting: every `connect` Meta delivers rings every agent.
 *
 * Open by default at each step — only an explicit opt-out or a well-formed
 * schedule refuses a call, so a half-configured number never goes silent.
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
 * The terminal status of a call row, shaped as the realtime ended event
 * carries it, or `null` while the call is still live.
 */
const endedStatusOf = (
  call: WhatsappCallModel,
): RealtimeEventWhatsappCallTransportEnded["data"]["status"] | null =>
  whatsappVoipCallService.isCallEnded(call)
    ? // `isCallEnded` holds exactly for the statuses this event carries.
      (call.status as RealtimeEventWhatsappCallTransportEnded["data"]["status"])
    : null

/**
 * Delivers the SDP offer to every rung agent. A per-recipient failure never
 * blocks the rest: `sendToWorkspaceMember` never throws (it catches
 * internally and returns `null` on failure), so a falsy result — not a
 * try/catch — is what surfaces a delivery failure here.
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
 * Closes the last race of a caller hanging up while the offer is on its way:
 * a terminate finalized after `handleConnect` checked the row can emit its
 * ended event BEFORE this job's offer reaches the agents, leaving every
 * dialog ringing a dead call until its own deadline. Re-reading the row
 * after delivery catches it — the finalize writes the terminal status before
 * it emits — and the same ended event is re-sent to the agents this job
 * rang. A duplicate ended event is harmless: the client drops a call it no
 * longer holds.
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
 * `handleConnect` — rings EVERY eligible agent (ring-all, the classic
 * telephony fork-dial pattern): resolves the live ring set, then delivers
 * the SDP offer to each one's realtime connections. The fenced CAS in
 * `claimForAnswer` lets only the first to answer win. Rejects when nobody
 * has the inbox open. The durable expiry job is scheduled at the webhook
 * boundary.
 *
 * Meta does not order a call's webhooks, so the caller's `terminate` can be
 * processed before this job runs. A call whose row is already terminal is
 * never rung and never Meta-rejected — it is over on Meta's side too.
 */
const handleConnect = async (data: HandleConnectData): Promise<void> => {
  const { wacid, deadlineAt, phoneNumberId, receivedAt } = data

  // Checked before anything else: the terminate that ended this call found
  // no offer and no control to clean up, so nothing else would stop a ring.
  const existing = await whatsappCallRepository.findByWacid(wacid)
  if (existing && whatsappVoipCallService.isCallEnded(existing)) {
    await whatsappVoipSignalingService.deleteOffer(wacid)
    logger.info(
      { wacid, status: existing.status },
      "Whatsapp VoIP: connect for a call that already ended; not ringing",
    )
    return
  }

  // A redelivered connect for a call that has already been claimed or answered
  // must do NOTHING: every remaining branch below can reject the call at Meta,
  // and rejecting a live call would drop an agent mid-conversation. The
  // `alreadyProgressed` branch further down says the same thing, but it only
  // runs after those reject paths, and `resolveRingTargets` creates a control
  // record on the way — so the check is made here, read-only, first.
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

  // Before the offer is even read, and long before any agent is rung: the
  // business has turned calling off, muted the inbound side, or the call
  // arrived outside its own call hours. Rejected rather than dropped so Meta
  // ends the call and the customer stops hearing ringing. Evaluated against
  // the moment the webhook arrived, not the moment this job ran, so a queue
  // backlog can never push a call that arrived in hours out of them.
  const refusal = inboundCallRefusal(integration, new Date(receivedAt))
  if (refusal) {
    logger.info(
      { wacid, workspaceId, refusal },
      "Whatsapp VoIP: inbound call refused by this number's calling settings",
    )
    // Which primitive ends the call depends on whether a control record
    // exists. `control` was read before the integration lookup, so an agent
    // could have claimed the call in between: for a redelivery that already
    // had one, `endReservedCall` CASes out of `reserved` and no-ops if that
    // claim won, leaving the live call alone. A first delivery has no control
    // yet, and `rejectUnreachableCall` (Graph reject + finalize, no CAS) is
    // the only thing that can end it.
    if (control) {
      await endReservedCall({ wacid, auth })
    } else {
      await rejectUnreachableCall({ wacid, auth })
    }
    return
  }

  // Offer FIRST, before ringing anyone: a connect with no stored offer is
  // either an unprocessable-SDP connect (deliberately never stored — see
  // `rejectUnprocessableConnect`) or one whose offer TTL lapsed. Either way it
  // must be Meta-rejected, and doing it here means no agent is ever rung for a
  // doomed call. There is no control record yet, so `rejectUnreachableCall`
  // (Graph reject + finalize, no CAS) is the right primitive.
  const offer = await whatsappVoipSignalingService.readOffer(wacid)
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

  if (whatsappVoipCallService.isCallEnded(call)) {
    // The terminate finalized while the ring set was being reserved. If its
    // finalize ran before `resolveRingTargets`, it saw no control and left
    // the one just created `reserved`, so end it here — without Meta, and
    // without re-finalizing. Both calls are no-ops when the finalize already
    // did the same.
    await whatsappVoipCallService.endCall({ wacid, allowFromAccepted: false })
    await whatsappVoipSignalingService.deleteOffer(wacid)
    return
  }

  await ringAgents({
    workspaceId,
    targets: ring.targets,
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
  await notifyRungAgentsIfEnded({ wacid, workspaceId, targets: ring.targets })
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
