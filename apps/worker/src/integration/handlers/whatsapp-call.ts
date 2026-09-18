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
 * Cannot resolve the row yet for an outbound ACCEPTED status — races the
 * connect/answer job that attaches wacid. Retried via
 * CALL_EVENT_JOB_RETRY_OPTIONS instead of dropping the accept.
 */
class WhatsappCallStatusRowNotReadyError extends Error {
  constructor(id: string) {
    super(`whatsapp-call-status-row-not-ready: ${id}`)
    this.name = "WhatsappCallStatusRowNotReadyError"
  }
}

/**
 * Meta's biz_opaque_callback_data echo (the outbound attemptId), when non-
 * empty.
 */
const readBizOpaqueCallbackData = (event: CallEvent): string | undefined =>
  event.bizOpaqueCallbackData ? event.bizOpaqueCallbackData : undefined

/**
 * Resolves the WhatsappCall row for a status webhook item: wacid first, else
 * attemptId — statuses can arrive before the connect/answer event attaches
 * wacid since job ordering isn't guaranteed.
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
 * Best-effort targeted forward of whatsappCallOutboundStatus to the initiator —
 * never broadcast or awaited; DB/Redis state is the source of truth, this is
 * just a UI hint.
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
 * Outbound status handling — direction comes from the DB row (statuses carry
 * none). RINGING/ACCEPTED only advance interim state and forward a targeted
 * whatsappCallOutboundStatus event; REJECTED finalizes immediately via the same
 * path a terminate uses, so a later Meta terminate for the same call is an
 * idempotent no-op.
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

  const entity: MessageWhatsappCallEntity = {
    type: "whatsapp_call",
    direction: "businessInitiated",
    status: "rejected",
  }
  await finalizeCallSideEffects({ call, entity })
}

/**
 * A call_created/terminate webhook for a BUSINESS_INITIATED call must never
 * create a row — the outbound action already inserted the pending row before
 * dialing. Correlation is by exact wacid/attemptId only.
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
 * The item's own identity fields, picked by direction: from/from_user_id for
 * USER_INITIATED, to/to_user_id for BUSINESS_INITIATED. Both undefined means a
 * session-less/legacy connect — the only case where falling back to
 * payload.contact is safe.
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
 * Whether contact is the same party the item itself identifies — contacts[] is
 * only index-aligned for a single-contact batch, so a contact from a different
 * batched item must never be trusted just because it's present.
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
 * Resolves the customer's identity plus the one payload.contact that belongs to
 * this item (never another batched item's contact). The item's own identity
 * fields win; contact only fills in what the item omitted — needed because a
 * real payload often carries only from_user_id with the phone number in
 * contacts[], and without this the row would key by BSUID and split call
 * history from the message-keyed contact.
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
  // A username/BSUID-only caller has no waId — fall back to the BSUID as
  // sourceId (mirrors incomming-message.ts), which downstream keys the row as
  // BSUID-keyed.
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
 * Attaches a BUSINESS_INITIATED webhook's wacid to the pending outbound row the
 * action already created — never inserts one. Correlation is exact only, by
 * wacid then attemptId; no windowed fallback, which could attach a late
 * webhook to the wrong attempt.
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
    // No activity message or trigger fires on connect for either direction
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
      // ACCEPTED is authoritative and the row is created pre-dial — a miss here
      // is almost certainly a race against the connect job, so retry rather
      // than drop it.
      throw new WhatsappCallStatusRowNotReadyError(event.wacid)
    }
    // The connect job creates the row; statuses can race ahead of it. Missing
    // rows are logged, not retried — the terminate event still upserts final
    // state.
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

  // A REJECTED that lost the race against terminate upgraded the row from
  // failed to rejected above, but its activity message still says missed —
  // repair that projection too, keyed off the actual DB transition so it stays
  // correct under concurrent finalization.
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

/**
 * One of Meta's terminate errors[] items (media-drop codes
 * 138021/138022/138023, etc).
 */
type WhatsappCallTerminateErrorLike = NonNullable<
  TerminateCallEvent["errors"]
>[number]

const readTerminateErrors = (
  event: TerminateCallEvent,
): WhatsappCallTerminateErrorLike[] | undefined => event.errors

/**
 * Joins Meta's terminate errors[] into a single diagnosis string for lastError.
 */
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

type TerminalStatusFacts = {
  priorStatus: WhatsappCallModel["status"] | undefined
  priorLastError: WhatsappCallModel["lastError"] | undefined
  wasAnswered: boolean
}

type TerminalStatusRule = {
  status: MessageWhatsappCallEntity["status"]
  matches: (facts: TerminalStatusFacts) => boolean
}

/**
 * How a terminated call is labelled — first match wins, order matters; a call
 * matching none is failed.
 */
const TERMINAL_STATUS_RULES: readonly TerminalStatusRule[] = [
  // A REJECTED status already finalized this call as declined; the trailing
  // terminate (always COMPLETED on Meta's side) must never upgrade it back to
  // completed.
  {
    status: "rejected",
    matches: ({ priorStatus }) => priorStatus === "rejected",
  },
  // The agent hung up before the customer answered (end-voip-call-as-agent
  // stamped this) — a business cancel, not a no-answer.
  {
    status: "canceled",
    matches: ({ wasAnswered, priorLastError }) =>
      !wasAnswered && priorLastError === CALL_CANCELED_BY_BUSINESS_LAST_ERROR,
  },
  { status: "completed", matches: ({ wasAnswered }) => wasAnswered },
]

const resolveTerminalEntity = (
  event: Extract<CallEvent, { kind: "terminate" }>,
  priorStatus: WhatsappCallModel["status"] | undefined,
  direction: WhatsappCallModel["direction"],
  priorLastError: WhatsappCallModel["lastError"] | undefined,
): MessageWhatsappCallEntity => {
  // Meta reports a rejected/unanswered call as terminate status COMPLETED too,
  // filling start_time/duration only when picked up — so COMPLETED with neither
  // timestamp means it never connected and must render as missed/failed, not
  // stuck on 'processing recording'.
  const metaReportsAnswered =
    event.status === "COMPLETED" &&
    (event.startTime !== undefined ||
      (event.durationSeconds !== undefined && event.durationSeconds > 0))

  // Our own row outranks the webhook on whether the call connected:
  // accepted/completed are only set by real accept/hangup events, while Meta
  // can terminate a genuinely answered call with no start_time/duration when
  // media never flowed.
  const rowReportsAnswered =
    priorStatus === "accepted" || priorStatus === "completed"
  const wasAnswered = metaReportsAnswered || rowReportsAnswered

  const status =
    TERMINAL_STATUS_RULES.find((rule) =>
      rule.matches({ priorStatus, priorLastError, wasAnswered }),
    )?.status ?? "failed"

  return {
    type: "whatsapp_call",
    direction,
    status,
    // Meta's own duration when given; otherwise undefined so it renders as a
    // plain 'Voice call' rather than falsely claiming a zero-second call.
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
        // Ambiguous or unresolved — already logged. Never fabricate a row for a
        // BUSINESS_INITIATED terminate.
        return
      }
    } else if (event.direction === undefined) {
      // Mirrors normalizeCallItem's connect branch — skips an event with no
      // direction rather than assuming one, since defaulting here would record
      // a lost-direction terminate as an inbound call that never happened.
      logger.warn(
        { wacid: event.wacid, phoneNumberId: props.payload.phoneNumberId },
        "Whatsapp call terminate skipped: missing direction",
      )
      return
    } else {
      // Terminate can arrive without a prior connect row (e.g. failed connect
      // job) — upsert directly so the call is still recorded. Only valid for
      // USER_INITIATED.
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
  // Prefer Meta's event timestamps — dedup keys on sourceId, but createdAt
  // should reflect when the call actually ended.
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
