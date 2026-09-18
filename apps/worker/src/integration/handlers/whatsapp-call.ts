import {
  sendToWorkspaceMember,
  whatsappCallLifecycleService,
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
  "ringing" | "accepted" | "rejected" | undefined
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

/** Meta's `biz_opaque_callback_data` echo (the outbound `attemptId`), when non-empty. */
const readBizOpaqueCallbackData = (event: CallEvent): string | undefined =>
  event.bizOpaqueCallbackData ? event.bizOpaqueCallbackData : undefined

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
    await whatsappCallLifecycleService.advanceInterimStatus({
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
    await whatsappVoipCallService.markAcceptedByAgent({
      whatsappCallId: call.id,
      agentUserId: call.answeredByUserId,
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
 * never create a row: `initiateOutboundVoipCallAction` already inserted the pending
 * outbound row (`attemptId`, null `wacid`) before dialing. Correlation
 * back to that row is by exact `wacid`/`attemptId` only (see
 * {@link attachBusinessInitiatedToPendingOutbound}) — the previous
 * time-windowed `(inboxId, contactInboxId)` heuristic is removed.
 */

/** Meta call timestamps are unix seconds (as strings). */
const parseUnixSeconds = (value: string | undefined): Date | undefined => {
  if (!value) {
    return
  }
  const seconds = Number(value)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined
}

/**
 * The item's OWN identity fields for this call, picked by direction — the
 * counterparty for a USER_INITIATED item is `from`/`from_user_id`; for a
 * BUSINESS_INITIATED item it is `to`/`to_user_id`. `undefined`/`undefined`
 * means the item carries no identity of its own (a session-less/legacy
 * connect), the only case where a fallback to `payload.contact` is safe.
 */
const readItemIdentity = (
  event: Extract<CallEvent, { kind: "connect" | "terminate" }>,
): { waId: string | undefined; userId: string | undefined } => {
  const isBusinessInitiated = event.direction === "businessInitiated"
  return {
    waId: isBusinessInitiated ? event.to : event.from,
    userId: isBusinessInitiated ? event.toUserId : event.fromUserId,
  }
}

/**
 * Whether `contact` is the SAME party the item itself identifies as —
 * `contacts[]` is index-aligned by Meta only for a single-contact batch, so
 * a `payload.contact` that came from a different item in the same batch
 * (D2 — see `calls.ts`'s `pickContactForCallItem`) must never be trusted
 * just because it is present.
 */
const contactMatchesIdentity = (
  contact: CallPayload["contact"],
  itemWaId: string | undefined,
  itemUserId: string | undefined,
): boolean =>
  contact !== undefined &&
  ((itemWaId !== undefined && contact.waId === itemWaId) ||
    (itemUserId !== undefined && contact.userId === itemUserId))

/**
 * Resolves the customer's identity for this call — a phone number (`waId`)
 * and/or a BSUID (`userId`) for a username-only caller — plus the ONE
 * `payload.contact` that is actually this party, never another batched
 * item's contact.
 *
 * The item's own `from`/`to`/`from_user_id`/`to_user_id` is authoritative,
 * mirroring incoming-message resolution. `payload.contact` overrides it only
 * when the item carries no identity at all (a session-less/legacy connect),
 * the one case where the contact IS that identity.
 *
 * Otherwise the contact is consulted only when it matches the item on at
 * least one field — a mismatched one belongs to a different batched item.
 * A MATCHED contact may also FILL IN the field the item omitted, because a
 * real user-initiated payload routinely carries only `from_user_id` with the
 * phone number living in `contacts[]`. That is safe: it already proved
 * itself the same party via the other field. Without it every such call
 * would key its `ContactInbox` by BSUID and split call history off the
 * existing message-keyed contact.
 */
const resolveCallerIdentity = (
  payload: CallPayload,
  event: Extract<CallEvent, { kind: "connect" | "terminate" }>,
): {
  waId: string | undefined
  userId: string | undefined
  matchedContact: CallPayload["contact"]
} => {
  const { waId: itemWaId, userId: itemUserId } = readItemIdentity(event)
  if (itemWaId === undefined && itemUserId === undefined) {
    return {
      waId: payload.contact?.waId,
      userId: payload.contact?.userId,
      matchedContact: payload.contact,
    }
  }
  const matchedContact = contactMatchesIdentity(
    payload.contact,
    itemWaId,
    itemUserId,
  )
    ? payload.contact
    : undefined
  return {
    waId: itemWaId ?? matchedContact?.waId,
    userId: itemUserId ?? matchedContact?.userId,
    matchedContact,
  }
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

  const { waId, userId, matchedContact } = resolveCallerIdentity(
    props.payload,
    event,
  )
  // A Username/BSUID-only caller has no `waId` at all — fall back to the
  // BSUID as the primary `sourceId` (mirrors
  // `incomming-message.ts`'s `sourceId: asString(data.from) ?? sourceUserId ?? ""`),
  // which is what makes `isSourceUserIdKeyedIdentity`/
  // `shouldAddressBySourceUserId` treat the row as BSUID-keyed downstream.
  const sourceId = waId ?? userId
  if (!sourceId) {
    return { inbox, detected: null }
  }

  const detected = await detectContactAndConversation({
    inbox,
    integrationRow,
    incomingContact: {
      sourceId,
      sourceUserId: userId,
      sourceUsername: matchedContact?.username,
      firstName: matchedContact?.name,
    },
    source: contactSources.enum.inboundMessage,
  })

  return { inbox, detected }
}

/**
 * Attaches a BUSINESS_INITIATED `call_created`/`terminate` webhook's `wacid`
 * to the pending outbound row `initiateOutboundVoipCallAction` already created —
 * NEVER inserts a new row. Logs `outbound-correlation-unmatched` and does
 * nothing (no row, no side effects) when no pending attempt matches — that
 * is the correct, safe outcome: a webhook this plan cannot confidently
 * attribute must not fabricate a call row.
 *
 * Correlation is EXACT ONLY — `wacid` or `attemptId`
 * (`biz_opaque_callback_data`), resolution order cheapest/most-exact first:
 * 1. `findByWacid`: the VoIP outbound action (`initiate-outbound-voip-call.action.ts`)
 *    already calls `attachWacid` synchronously right after `connectCall`
 *    returns, well before this webhook-driven event is processed — so for
 *    a VoIP outbound call the row almost always already carries this exact
 *    wacid by the time we get here.
 * 2. `findByAttemptId` via Meta's echoed `biz_opaque_callback_data`, when
 *    present: exact and race-free. Present on `connect` events; absent on
 *    `terminate` events.
 *
 * The previous third step — a `since`-windowed `findPendingOutbound` lookup
 * by `(inboxId, contactInboxId)` — is REMOVED: it could attach a late
 * webhook from a lost-response attempt to a newer attempt for the same
 * contact, and no time window only lowers (never eliminates) that
 * probability. Without an exact match the row is left to its own dial-expiry
 * sweep rather than risk a wrong attach.
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
      return await whatsappVoipCallService.attachMetaCallId({
        whatsappCallId: byAttempt.id,
        wacid,
      })
    }
  }

  logger.warn(
    {
      wacid,
      attemptId,
      phoneNumberId: props.payload.phoneNumberId,
      event: "outbound-correlation-unmatched",
    },
    "Whatsapp call (businessInitiated): no exact wacid/attemptId match to attach to",
  )
  return
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

  const { isNew } = await whatsappCallLifecycleService.recordIncomingCall({
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

  const transition = await whatsappCallLifecycleService.advanceInterimStatus({
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

type TerminateCallEvent = Extract<CallEvent, { kind: "terminate" }>

/** One of Meta's terminate `errors[]` items (media-drop codes 138021/138022/138023, etc). */
type WhatsappCallTerminateErrorLike = NonNullable<
  TerminateCallEvent["errors"]
>[number]

const readTerminateErrors = (
  event: TerminateCallEvent,
): WhatsappCallTerminateErrorLike[] | undefined => event.errors

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
  const metaReportsAnswered =
    event.status === "COMPLETED" &&
    (event.startTime !== undefined ||
      (event.durationSeconds !== undefined && event.durationSeconds > 0))

  // Our own row outranks the webhook on whether the call ever connected.
  // `accepted` is written only after Meta accepted it (`markAcceptedByAgent`
  // for an inbound answer, the ACCEPTED status for an outbound dial), and
  // `completed` only by an agent hanging a live call up. Meta, meanwhile,
  // terminates a genuinely answered call with neither `start_time` nor
  // `duration` when media never flowed — so trusting the webhook alone
  // rendered a call the agent really did answer as "Missed voice call",
  // directly contradicting the answerer named on the very same card, and let
  // a late terminate downgrade a row the hangup had already finalized.
  const rowReportsAnswered =
    priorStatus === "accepted" || priorStatus === "completed"
  const wasAnswered = metaReportsAnswered || rowReportsAnswered

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
    // Meta's own duration when it gave one. For a call only OUR row knows was
    // answered there is no duration to report, and claiming `0` would read as
    // a zero-second call — `undefined` renders a plain "Voice call" instead.
    durationSeconds: metaReportsAnswered
      ? (event.durationSeconds ?? 0)
      : event.durationSeconds,
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
    } else if (event.direction === undefined) {
      // Mirrors `normalizeCallItem`'s connect branch
      // (`integrations/whatsapp/src/lib/calls.ts`), which skips an event
      // carrying no direction rather than assuming one. Only the
      // ROW-CREATING path needs this: a terminate for a call we already have
      // reads its direction off the row, never off the event. Defaulting
      // here instead would record a BUSINESS_INITIATED terminate that lost
      // its direction as an inbound call that never happened.
      logger.warn(
        { wacid: event.wacid, phoneNumberId: props.payload.phoneNumberId },
        "Whatsapp call terminate skipped: missing direction",
      )
      return
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
      const upserted = await whatsappCallLifecycleService.recordIncomingCall({
        wacid: event.wacid,
        direction: event.direction,
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
