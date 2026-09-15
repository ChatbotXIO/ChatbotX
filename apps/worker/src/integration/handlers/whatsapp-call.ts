import {
  sendToWorkspaceMember,
  whatsappVoipCallService,
} from "@chatbotx.io/business"
import { contactSources } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import {
  emitIncomingCall,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import {
  RealtimeEventType,
  type RealtimeEventWhatsappCallOutboundStatus,
} from "@chatbotx.io/partysocket-config"
import {
  CALL_CANCELED_BY_BUSINESS_LAST_ERROR,
  type MessageWhatsappCallEntity,
} from "@chatbotx.io/sdk"
import type { IntegrationJobWhatsappCallEvent } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"
import { detectContactAndConversation } from "./received-message"
import {
  buildCallActivityText,
  callActivitySourceId,
  finalizeCallSideEffects,
} from "./shared/whatsapp-call-finalize"

type CallEventData = IntegrationJobWhatsappCallEvent["data"]
type CallPayload = CallEventData["payload"]
type CallEvent = CallPayload["event"]

const INTERIM_STATUS_MAP: Record<
  string,
  WhatsappCallModel["status"] | undefined
> = {
  RINGING: "ringing",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
}

/**
 * Thrown when a status webhook for a BUSINESS_INITIATED (outbound) call's
 * ACCEPTED status cannot resolve a `WhatsappCall` row yet — the row is
 * created pre-dial (`createPendingOutbound`), so this should only ever race
 * the connect/answer job that attaches `wacid` to it. BullMQ retries per
 * `CALL_EVENT_JOB_RETRY_OPTIONS` (see `integrations/whatsapp/src/handlers/
 * webhook.ts`) instead of silently dropping the authoritative accept.
 */
class WhatsappCallStatusRowNotReadyError extends Error {
  constructor(id: string) {
    super(`whatsapp-call-status-row-not-ready: ${id}`)
    this.name = "WhatsappCallStatusRowNotReadyError"
  }
}

/**
 * Meta's status webhook items carry `biz_opaque_callback_data` (the
 * `attemptId`), but the shared `IntegrationJobWhatsappCallEvent` DTO in
 * `@chatbotx.io/worker-config` does not yet declare that field on the
 * `status` event shape. The integrations-side parser (`extractCallEventPayloads`)
 * already puts it on the object at runtime — this reads it back via a narrow,
 * type-safe accessor instead of widening the shared DTO, which is out of
 * this change's scope (apps/worker only).
 */
const readBizOpaqueCallbackData = (event: object): string | undefined => {
  const value = (event as { bizOpaqueCallbackData?: unknown })
    .bizOpaqueCallbackData
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * Resolves the `WhatsappCall` row for a status webhook item: `wacid` first
 * (the common case — the row already has it attached), then a fallback via
 * `attemptId` (`biz_opaque_callback_data`) for a BUSINESS_INITIATED call
 * whose status arrives before the connect/answer event attaches `wacid`
 * (statuses are processed before call events within a batch, but jobs for
 * different events are not guaranteed to run in that order).
 */
const resolveStatusCallRow = async (
  event: Extract<CallEvent, { kind: "status" }>,
): Promise<WhatsappCallModel | undefined> => {
  const byWacid = await whatsappCallRepository.findByWacid(event.wacid)
  if (byWacid) {
    return byWacid
  }
  const attemptId = readBizOpaqueCallbackData(event)
  return attemptId
    ? await whatsappCallRepository.findByAttemptId(attemptId)
    : undefined
}

/**
 * Best-effort targeted forward of `whatsappCallOutboundStatus` (RINGING/
 * ACCEPTED) to the initiating agent's own connections — never broadcast,
 * and never awaited for correctness: a send failure only logs a warning
 * (`err`) and never fails the interim-status processing above it, since the
 * DB/Redis state transitions are the source of truth and the realtime event
 * is purely a UI hint for `pc.connectionState`-independent call progress.
 */
const notifyOutboundStatus = async (
  call: WhatsappCallModel,
  status: "ringing" | "accepted",
): Promise<void> => {
  if (!call.answeredByUserId) {
    return
  }

  const eventData: RealtimeEventWhatsappCallOutboundStatus["data"] = {
    whatsappCallId: call.id,
    wacid: call.wacid ?? "",
    attemptId: call.attemptId ?? "",
    status,
  }

  try {
    const result = await sendToWorkspaceMember(
      { workspaceId: call.workspaceId, userId: call.answeredByUserId },
      {
        eventType: RealtimeEventType.whatsappCallOutboundStatus,
        data: eventData,
      },
    )
    if (!result) {
      logger.warn(
        { whatsappCallId: call.id, status, userId: call.answeredByUserId },
        "Whatsapp VoIP: unable to deliver the outbound status realtime event",
      )
    }
  } catch (err: unknown) {
    logger.warn(
      { err, whatsappCallId: call.id, status },
      "Whatsapp VoIP: outbound status realtime send threw unexpectedly",
    )
  }
}

/**
 * Outbound (BUSINESS_INITIATED) status handling — direction is resolved from
 * the DB row (statuses never carry `direction` on the wire). RINGING/ACCEPTED
 * only advance interim state (best-effort Redis control + the authoritative
 * DB write); REJECTED finalizes immediately via the same shared side-effect
 * path a terminate uses — `emitVoipCallEnded` (inside `finalizeCallSideEffects`)
 * notifies the initiator, and a later Meta `terminate` webhook for the same
 * call is an idempotent no-op against the already-`rejected` row. RINGING/
 * ACCEPTED additionally forward a targeted `whatsappCallOutboundStatus`
 * realtime event to the initiator (see `notifyOutboundStatus`) so the
 * caller's browser can drive its UI from Meta's actual call progress instead
 * of `pc.connectionState`. REJECTED is not covered here — that path
 * finalizes immediately and the `whatsappCallTransportEnded` event already
 * notifies the initiator.
 */
const handleOutboundInterimStatus = async (
  call: WhatsappCallModel,
  event: Extract<CallEvent, { kind: "status" }>,
): Promise<void> => {
  if (event.status === "RINGING") {
    await whatsappCallRepository.updateInterimStatus({
      wacid: event.wacid,
      status: "ringing",
      current: call,
    })
    await whatsappVoipCallService.markOutboundRinging({ wacid: event.wacid })
    await notifyOutboundStatus(call, "ringing")
    return
  }

  if (event.status === "ACCEPTED") {
    if (!call.answeredByUserId) {
      logger.warn(
        { wacid: event.wacid, callId: call.id },
        "Whatsapp outbound call accepted: row has no answeredByUserId; cannot mark accepted",
      )
      return
    }
    await whatsappCallRepository.markAcceptedIfActive({
      id: call.id,
      answeredByUserId: call.answeredByUserId,
    })
    await whatsappVoipCallService.markOutboundAccepted({ wacid: event.wacid })
    await notifyOutboundStatus(call, "accepted")
    return
  }

  // REJECTED
  const entity: MessageWhatsappCallEntity = {
    type: "whatsapp_call",
    direction: "businessInitiated",
    status: "rejected",
  }
  await finalizeCallSideEffects({ call, entity })
}

/**
 * A `call_created`/`terminate` webhook for a BUSINESS_INITIATED call must
 * never create a row: `startWhatsappCallAction` already
 * inserted the pending outbound row (`attemptId`, null `wacid`) before
 * dialing. Meta's own attempt-correlation is limited to
 * `(inboxId, contactInboxId)` — there is no attemptId on the wire — so a
 * webhook attaches to the pending row created within this window BEFORE the
 * event's own timestamp. Wide enough to survive normal webhook latency,
 * narrow enough that a call that's been ringing far longer than any real
 * attempt takes is treated as ambiguous rather than silently mis-attached.
 */
const OUTBOUND_CORRELATION_WINDOW_MS = 10 * 60 * 1000

/** Meta call timestamps are unix seconds (as strings). */
const parseUnixSeconds = (value: string | undefined): Date | undefined => {
  if (!value) {
    return
  }
  const seconds = Number(value)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined
}

/**
 * Resolves the customer's WhatsApp number for this call. `contacts[]` is
 * preferred; `from`/`to` on the call item is the fallback, picked by the
 * call's direction.
 */
const resolveCallerWaId = (
  payload: CallPayload,
  event: Extract<CallEvent, { kind: "connect" | "terminate" }>,
): string | undefined => {
  if (payload.contact?.waId) {
    return payload.contact.waId
  }
  return event.direction === "businessInitiated" ? event.to : event.from
}

const resolveCallParticipants = async (
  props: CallEventData,
  event: Extract<CallEvent, { kind: "connect" | "terminate" }>,
) => {
  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      "whatsapp",
      props.integrationIdentifier,
    )

  const waId = resolveCallerWaId(props.payload, event)
  if (!waId) {
    return { inbox, detected: null }
  }

  const detected = await detectContactAndConversation({
    inbox,
    integrationRow,
    incomingContact: {
      sourceId: waId,
      sourceUserId: props.payload.contact?.userId,
      firstName: props.payload.contact?.name,
    },
    source: contactSources.enum.inboundMessage,
  })

  return { inbox, detected }
}

/**
 * Attaches a BUSINESS_INITIATED `call_created`/`terminate` webhook's `wacid`
 * to the pending outbound row `startWhatsappCallAction` already created —
 * NEVER inserts a new row. Logs `outbound-correlation-ambiguous`
 * and does nothing (no row, no side effects) when no pending attempt
 * matches — that is the correct, safe outcome: a webhook this plan cannot
 * confidently attribute must not fabricate a call row.
 *
 * L1 fix — resolution order, cheapest/most-exact first:
 * 1. `findByWacid`: the VoIP outbound action (`initiate-outbound-voip-call.action.ts`)
 *    already calls `attachWacid` synchronously right after `connectCall`
 *    returns, well before this webhook-driven event is processed — so for
 *    a VoIP outbound call the row almost always already carries this exact
 *    wacid by the time we get here. Without this check, every VoIP outbound
 *    connect fell through to the `wacid IS NULL` `findPendingOutbound`
 *    query below (which can never match a row that already has a wacid)
 *    and spuriously logged `outbound-correlation-ambiguous` on every call.
 * 2. `findByAttemptId` via Meta's echoed `biz_opaque_callback_data`, when
 *    present: exact and race-free, so preferred over the time-window
 *    heuristic. Present on `connect` events (VoIP or SIP); absent on
 *    SIP-mode/legacy connects and on `terminate` events, so SIP correlation
 *    still falls through unchanged.
 * 3. The pre-existing `since`-windowed `findPendingOutbound` heuristic,
 *    unchanged, for everything the two lookups above miss.
 */
const attachBusinessInitiatedToPendingOutbound = async (
  props: CallEventData,
  event: Extract<
    CallEvent,
    { kind: "connect" | "terminate"; direction?: string }
  >,
  wacid: string,
): Promise<WhatsappCallModel | undefined> => {
  const alreadyAttached = await whatsappCallRepository.findByWacid(wacid)
  if (alreadyAttached) {
    return alreadyAttached
  }

  const attemptId = readBizOpaqueCallbackData(event)
  if (attemptId) {
    const byAttempt = await whatsappCallRepository.findByAttemptId(attemptId)
    if (byAttempt) {
      return await whatsappCallRepository.attachWacid({
        id: byAttempt.id,
        wacid,
      })
    }
  }

  const { inbox, detected } = await resolveCallParticipants(props, event)
  if (!detected) {
    logger.warn(
      { wacid, phoneNumberId: props.payload.phoneNumberId },
      "Whatsapp call (businessInitiated) skipped: unable to resolve caller",
    )
    return
  }

  const eventTimestamp =
    parseUnixSeconds(
      "timestamp" in event
        ? (event.timestamp as string | undefined)
        : undefined,
    ) ?? new Date()
  const since = new Date(
    eventTimestamp.getTime() - OUTBOUND_CORRELATION_WINDOW_MS,
  )

  const pending = await whatsappCallRepository.findPendingOutbound({
    inboxId: inbox.id,
    contactInboxId: detected.contactInbox.id,
    since,
  })
  if (!pending) {
    logger.warn(
      {
        wacid,
        inboxId: inbox.id,
        contactInboxId: detected.contactInbox.id,
        event: "outbound-correlation-ambiguous",
      },
      "Whatsapp call (businessInitiated): no pending outbound attempt to attach to",
    )
    return
  }

  return await whatsappCallRepository.attachWacid({ id: pending.id, wacid })
}

const handleConnect = async (
  props: CallEventData,
  event: Extract<CallEvent, { kind: "connect" }>,
): Promise<void> => {
  if (event.direction === "businessInitiated") {
    // No activity message / trigger fires on connect for either direction
    // today — attaching is the only work needed here.
    await attachBusinessInitiatedToPendingOutbound(props, event, event.wacid)
    return
  }

  const { inbox, detected } = await resolveCallParticipants(props, event)
  if (!detected) {
    logger.warn(
      { wacid: event.wacid, phoneNumberId: props.payload.phoneNumberId },
      "Whatsapp call connect skipped: unable to resolve caller",
    )
    return
  }

  const { isNew } = await whatsappCallRepository.createIfAbsent({
    wacid: event.wacid,
    direction: event.direction,
    status: "ringing",
    workspaceId: inbox.workspaceId,
    inboxId: inbox.id,
    contactInboxId: detected.contactInbox.id,
    conversationId: detected.conversation.id,
  })

  // Fire the trigger/webhook event only for the winning insert — a Meta
  // redelivery that lost the createIfAbsent race must not re-fire flows.
  if (isNew) {
    await emitIncomingCall(inbox.workspaceId, detected.contactInbox.contactId, {
      callId: event.wacid,
      conversationId: detected.conversation.id,
    })
  }
}

const handleInterimStatus = async (
  event: Extract<CallEvent, { kind: "status" }>,
): Promise<void> => {
  const status = INTERIM_STATUS_MAP[event.status]
  if (!status) {
    return
  }

  const existing = await resolveStatusCallRow(event)
  if (!existing) {
    if (event.status === "ACCEPTED") {
      // Unlike RINGING/REJECTED, ACCEPTED is authoritative and the row is
      // created pre-dial for an outbound call — a miss here is almost
      // certainly a race against the connect/answer job, so retry rather
      // than silently drop the accept.
      throw new WhatsappCallStatusRowNotReadyError(event.wacid)
    }
    // The connect job creates the row; statuses can race ahead of it in the
    // queue. Missing rows are logged (not retried) — the terminate event
    // still upserts the final state.
    logger.warn(
      { wacid: event.wacid, status: event.status },
      "Whatsapp call status skipped: call row not found",
    )
    return
  }

  if (existing.direction === "businessInitiated") {
    await handleOutboundInterimStatus(existing, event)
    return
  }

  const transition = await whatsappCallRepository.updateInterimStatus({
    wacid: event.wacid,
    status,
    current: existing,
  })

  // A REJECTED that lost the race against the terminate job upgraded the row
  // from `failed` to `rejected` above — the already-written activity message
  // still says "missed", so repair its projection too. Keyed off the ACTUAL
  // DB transition (not the read above), which stays correct even when the
  // terminate finalizes concurrently between our read and the update.
  if (status === "rejected" && transition?.previousStatus === "failed") {
    const entity: MessageWhatsappCallEntity = {
      type: "whatsapp_call",
      direction: existing.direction,
      status: "rejected",
    }
    const repository = await createMessageRepository()
    await repository.updateContentBySourceId(
      callActivitySourceId(existing.id),
      existing.workspaceId,
      { text: buildCallActivityText(entity), contentAttributes: entity },
    )
  }
}

/** Bounded, minimal mirror of the parser's terminate-error shape. */
type WhatsappCallTerminateErrorLike = {
  code?: number
  title?: string
  message?: string
}

/**
 * The shared `IntegrationJobWhatsappCallEvent` DTO in `@chatbotx.io/worker-config`
 * does not yet declare `errors[]` on the `terminate` event shape, but the
 * integrations-side parser (`extractCallEventPayloads`) already puts it on
 * the object at runtime (media-drop codes 138021/138022/138023, etc). Read
 * it back via a narrow, type-safe accessor instead of widening the shared
 * DTO, which is out of this change's scope (apps/worker only).
 */
const readTerminateErrors = (
  event: object,
): WhatsappCallTerminateErrorLike[] | undefined => {
  const value = (event as { errors?: unknown }).errors
  return Array.isArray(value)
    ? (value as WhatsappCallTerminateErrorLike[])
    : undefined
}

/** Joins Meta's terminate `errors[]` into a single diagnosis string for `lastError`. */
const formatTerminateErrors = (
  errors: WhatsappCallTerminateErrorLike[] | undefined,
): string | undefined => {
  if (!errors || errors.length === 0) {
    return
  }
  return errors
    .map(
      (error) => `${error.code ?? "?"}:${error.title ?? error.message ?? ""}`,
    )
    .join("; ")
}

const resolveTerminalEntity = (
  event: Extract<CallEvent, { kind: "terminate" }>,
  priorStatus: WhatsappCallModel["status"] | undefined,
  direction: WhatsappCallModel["direction"],
  priorLastError: WhatsappCallModel["lastError"] | undefined,
): MessageWhatsappCallEntity => {
  // Meta reports a rejected/unanswered call as `terminate status:COMPLETED`
  // too ("a call rejected by the callee counts as completed"), and only fills
  // `start_time`/`duration` when the call was actually PICKED UP. So COMPLETED
  // alone does not mean "answered" — a COMPLETED with neither timestamp is a
  // call that never connected (rang out / declined), which must render as a
  // missed/failed call, never as an "Audio call" stuck on "recording
  // processing…" waiting for a recording that can never exist.
  const wasAnswered =
    event.status === "COMPLETED" &&
    (event.startTime !== undefined ||
      (event.durationSeconds !== undefined && event.durationSeconds > 0))

  let status: MessageWhatsappCallEntity["status"]
  if (priorStatus === "rejected") {
    // A REJECTED status webhook already finalized this call as declined; the
    // trailing terminate (always COMPLETED on Meta's side) must never upgrade
    // it back to "completed" — that is what made "Declined voice call"
    // silently turn into an "Audio call" card.
    status = "rejected"
  } else if (
    !wasAnswered &&
    priorLastError === CALL_CANCELED_BY_BUSINESS_LAST_ERROR
  ) {
    // The agent hung up an outbound call before the customer answered
    // (`end-voip-call-as-agent` stamped this marker) — a business cancel, not
    // a customer "no answer".
    status = "canceled"
  } else if (wasAnswered) {
    status = "completed"
  } else {
    status = "failed"
  }

  return {
    type: "whatsapp_call",
    direction,
    status,
    durationSeconds: wasAnswered ? (event.durationSeconds ?? 0) : undefined,
  }
}

const handleTerminate = async (
  props: CallEventData,
  event: Extract<CallEvent, { kind: "terminate" }>,
): Promise<void> => {
  let call = await whatsappCallRepository.findByWacid(event.wacid)

  if (!call) {
    if (event.direction === "businessInitiated") {
      call = await attachBusinessInitiatedToPendingOutbound(
        props,
        event,
        event.wacid,
      )
      if (!call) {
        // Ambiguous or unresolved — already logged. Never fabricate a row
        // for a BUSINESS_INITIATED terminate.
        return
      }
    } else {
      // Terminate can arrive without a prior connect row (e.g. the connect
      // job failed): upsert directly so the call is still recorded. Only
      // valid for USER_INITIATED — see the branch above for
      // BUSINESS_INITIATED.
      const { inbox, detected } = await resolveCallParticipants(props, event)
      if (!detected) {
        logger.warn(
          { wacid: event.wacid, phoneNumberId: props.payload.phoneNumberId },
          "Whatsapp call terminate skipped: unable to resolve caller",
        )
        return
      }
      const upserted = await whatsappCallRepository.createIfAbsent({
        wacid: event.wacid,
        direction: event.direction ?? "userInitiated",
        status: "ringing",
        workspaceId: inbox.workspaceId,
        inboxId: inbox.id,
        contactInboxId: detected.contactInbox.id,
        conversationId: detected.conversation.id,
      })
      call = upserted.call
    }
  }

  const entity = resolveTerminalEntity(
    event,
    call.status,
    call.direction,
    call.lastError,
  )
  // Prefer Meta's event timestamps: the message dedup keys on sourceId, but
  // its createdAt should still reflect when the call actually ended.
  const endedAt = parseUnixSeconds(
    event.endTime ?? event.timestamp ?? event.startTime,
  )

  const lastError = formatTerminateErrors(readTerminateErrors(event))

  await finalizeCallSideEffects({
    call,
    entity,
    endedAt: endedAt ?? null,
    startedAt: parseUnixSeconds(event.startTime) ?? null,
    ...(lastError === undefined ? {} : { lastError }),
  })
}

export const handleWhatsappCallEvent = async (
  props: CallEventData,
): Promise<void> => {
  setWebhookExecutionContext({ source: "webhook" })
  const { event } = props.payload

  switch (event.kind) {
    case "connect":
      await handleConnect(props, event)
      return
    case "status":
      await handleInterimStatus(event)
      return
    case "terminate":
      await handleTerminate(props, event)
      return
    default: {
      const _exhaustive: never = event
      logger.warn({ event: _exhaustive }, "Unhandled whatsapp call event kind")
      return
    }
  }
}
