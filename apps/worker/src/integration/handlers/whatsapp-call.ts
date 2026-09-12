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
import type { MessageWhatsappCallEntity } from "@chatbotx.io/sdk"
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
 */
const attachBusinessInitiatedToPendingOutbound = async (
  props: CallEventData,
  event: Extract<
    CallEvent,
    { kind: "connect" | "terminate"; direction?: string }
  >,
  wacid: string,
): Promise<WhatsappCallModel | undefined> => {
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

  const existing = await whatsappCallRepository.findByWacid(event.wacid)
  if (!existing) {
    // The connect job creates the row; statuses can race ahead of it in the
    // queue. Missing rows are logged (not retried) — the terminate event
    // still upserts the final state.
    logger.warn(
      { wacid: event.wacid, status: event.status },
      "Whatsapp call status skipped: call row not found",
    )
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

const resolveTerminalEntity = (
  event: Extract<CallEvent, { kind: "terminate" }>,
  priorStatus: WhatsappCallModel["status"] | undefined,
  direction: WhatsappCallModel["direction"],
): MessageWhatsappCallEntity => {
  let status: MessageWhatsappCallEntity["status"] = "failed"
  if (event.status === "COMPLETED") {
    status = "completed"
  } else if (priorStatus === "rejected") {
    status = "rejected"
  }

  return {
    type: "whatsapp_call",
    direction,
    status,
    durationSeconds:
      event.status === "COMPLETED" ? (event.durationSeconds ?? 0) : undefined,
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

  const entity = resolveTerminalEntity(event, call.status, call.direction)
  // Prefer Meta's event timestamps: the message dedup keys on sourceId, but
  // its createdAt should still reflect when the call actually ended.
  const endedAt = parseUnixSeconds(
    event.endTime ?? event.timestamp ?? event.startTime,
  )

  await finalizeCallSideEffects({
    call,
    entity,
    endedAt: endedAt ?? null,
    startedAt: parseUnixSeconds(event.startTime) ?? null,
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
