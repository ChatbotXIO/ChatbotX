import {
  broadcastToWorkspaceParty,
  contactInboxService,
  conversationService,
} from "@chatbotx.io/business"
import type { WhatsappCallStatus } from "@chatbotx.io/database/partials"
import { contactSources } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import {
  emitCallEnded,
  emitIncomingCall,
  emitMissedAudioCall,
  setWebhookExecutionContext,
} from "@chatbotx.io/events"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import type { MessageWhatsappCallEntity } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import type { IntegrationJobWhatsappCallEvent } from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import { integrationService } from "../../services/integrations"
import { detectContactAndConversation } from "./received-message"

type CallEventData = IntegrationJobWhatsappCallEvent["data"]
type CallPayload = CallEventData["payload"]
type CallEvent = CallPayload["event"]

const INTERIM_STATUS_MAP: Record<string, WhatsappCallStatus> = {
  RINGING: "ringing",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
}

/** Meta call timestamps are unix seconds (as strings). */
const parseUnixSeconds = (value: string | undefined): Date | undefined => {
  if (!value) {
    return
  }
  const seconds = Number(value)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined
}

const formatDuration = (durationSeconds: number): string => {
  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * English fallback text stored on the activity message — used by previews
 * and exports. The inbox itself renders a localized label from
 * `contentAttributes` instead (see `RenderContentAttributes`).
 */
const buildCallActivityText = (entity: MessageWhatsappCallEntity): string => {
  if (entity.status === "completed") {
    return entity.durationSeconds === undefined
      ? "Voice call"
      : `Voice call · ${formatDuration(entity.durationSeconds)}`
  }
  if (entity.status === "rejected") {
    return "Declined voice call"
  }
  return "Missed voice call"
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

const handleConnect = async (
  props: CallEventData,
  event: Extract<CallEvent, { kind: "connect" }>,
): Promise<void> => {
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
  if (isNew && event.direction === "userInitiated") {
    await emitIncomingCall(inbox.workspaceId, detected.contactInbox.contactId, {
      wacid: event.wacid,
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
      event.wacid,
      existing.workspaceId,
      { text: buildCallActivityText(entity), contentAttributes: entity },
    )
  }
}

const resolveTerminalEntity = (
  event: Extract<CallEvent, { kind: "terminate" }>,
  priorStatus: WhatsappCallStatus | undefined,
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
    // Terminate can arrive without a prior connect row (e.g. the connect job
    // failed): upsert directly so the call is still recorded.
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

  const entity = resolveTerminalEntity(event, call.status, call.direction)
  // Prefer Meta's event timestamps: the message dedup on the sharded table
  // keys on (sourceId, createdAt window), so a replayed terminate must
  // produce the same createdAt — `new Date()` is only the last resort when
  // the payload carries no usable time at all.
  const endedAt = parseUnixSeconds(
    event.endTime ?? event.timestamp ?? event.startTime,
  )

  const repository = await createMessageRepository()
  const { message, isNew } = await repository.createOrUpdate({
    id: createId(),
    conversationId: call.conversationId,
    contactInboxId: call.contactInboxId,
    workspaceId: call.workspaceId,
    // wacid as sourceId deduplicates webhook redeliveries into one activity row.
    sourceId: event.wacid,
    senderType: "system",
    senderId: null,
    messageType: "activity",
    text: buildCallActivityText(entity),
    contentType: "text",
    contentAttributes: entity,
    createdAt: endedAt ?? new Date(),
  })

  await whatsappCallRepository.finalizeByWacid({
    wacid: event.wacid,
    status: entity.status,
    startedAt: parseUnixSeconds(event.startTime) ?? null,
    endedAt: endedAt ?? null,
    durationSeconds: event.durationSeconds ?? null,
    messageId: message.id,
  })

  if (!isNew) {
    return
  }

  await conversationService.updateFlowStepState({
    workspaceId: call.workspaceId,
    conversationId: call.conversationId,
    lastActivityAt: message.createdAt,
  })

  const contactInbox = await contactInboxService.findBy({
    where: { id: call.contactInboxId },
  })
  if (contactInbox) {
    const invalidation = await contactInboxService.updateTracking({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: call.workspaceId,
      data: { lastMessageAt: message.createdAt },
    })
    if (invalidation) {
      await contactInboxService.invalidateTracking(invalidation)
    }
  }

  try {
    broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: { ...message, attachments: [] },
    })
  } catch (error) {
    logger.warn({ err: error }, "Whatsapp call: unable to emit realtime event")
  }

  // Trigger/webhook events — guarded by isNew above, so a redelivered
  // terminate never re-fires flows.
  if (contactInbox) {
    if (entity.status === "completed") {
      await emitCallEnded(call.workspaceId, contactInbox.contactId, {
        wacid: event.wacid,
        durationSeconds: event.durationSeconds,
      })
    } else if (call.direction === "userInitiated") {
      await emitMissedAudioCall(call.workspaceId, contactInbox.contactId, {
        wacid: event.wacid,
        conversationId: call.conversationId,
      })
    }
  }
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
