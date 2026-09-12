import {
  broadcastToWorkspaceParty,
  contactInboxService,
  conversationService,
} from "@chatbotx.io/business"
import {
  createMessageRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { emitCallEnded, emitMissedAudioCall } from "@chatbotx.io/events"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import type { MessageWhatsappCallEntity } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../lib/logger"

/**
 * Deterministic, id-based sourceId: unlike the webhook's old
 * wacid-keyed scheme, this is stable regardless of WHICH path — the Meta
 * `terminate` webhook or the FreeSWITCH `CHANNEL_HANGUP_COMPLETE` handler —
 * reaches a terminal state first, so both converge on exactly one activity
 * message (`createOrUpdate` dedups on `sourceId`; the second caller is a
 * no-op that returns the existing row, `isNew: false`).
 */
export const callActivitySourceId = (callId: string): string =>
  `wacall-${callId}`

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
export const buildCallActivityText = (
  entity: MessageWhatsappCallEntity,
): string => {
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

export type FinalizeCallSideEffectsInput = {
  call: WhatsappCallModel
  entity: MessageWhatsappCallEntity
  /** Preferred over `new Date()` when a real terminal timestamp is known (Meta's webhook). */
  endedAt?: Date | null
  /** Only written when provided — omitting it never clears an already-set column. */
  startedAt?: Date | null
}

/**
 * The single terminate side-effect block shared by the Meta webhook and
 * the FreeSWITCH handler: activity message (dedup'd on the id-based
 * `sourceId`), the id-based `finalizeById` status write, flow-state/tracking
 * updates, the realtime `messageCreated` broadcast, and the
 * `callEnded`/`missedAudioCall` trigger events — all guarded on the winning
 * message insert (`isNew`) so a redelivery/second-path call never re-fires
 * any of them. Called from BOTH the Meta webhook's `handleTerminate` and the
 * FreeSWITCH `CHANNEL_HANGUP_COMPLETE` handler — no second implementation.
 */
export const finalizeCallSideEffects = async (
  input: FinalizeCallSideEffectsInput,
): Promise<void> => {
  const { call, entity } = input
  const endedAt = input.endedAt ?? new Date()

  const repository = await createMessageRepository()
  const { message, isNew } = await repository.createOrUpdate({
    id: createId(),
    conversationId: call.conversationId,
    contactInboxId: call.contactInboxId,
    workspaceId: call.workspaceId,
    sourceId: callActivitySourceId(call.id),
    senderType: "system",
    senderId: null,
    messageType: "activity",
    text: buildCallActivityText(entity),
    contentType: "text",
    contentAttributes: entity,
    createdAt: endedAt,
  })

  await whatsappCallRepository.finalizeById({
    id: call.id,
    status: entity.status,
    ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    endedAt,
    durationSeconds: entity.durationSeconds ?? null,
    messageId: message.id,
    current: call,
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
    await broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: { ...message, attachments: [] },
    })
  } catch (error) {
    logger.warn({ err: error }, "Whatsapp call: unable to emit realtime event")
  }

  if (!contactInbox) {
    return
  }

  // External correlation is the wacid/attemptId, never the DB id.
  const correlationId = call.wacid ?? call.attemptId ?? call.id
  if (entity.status === "completed") {
    await emitCallEnded(call.workspaceId, contactInbox.contactId, {
      callId: correlationId,
      durationSeconds: entity.durationSeconds,
    })
  } else if (call.direction === "userInitiated") {
    await emitMissedAudioCall(call.workspaceId, contactInbox.contactId, {
      callId: correlationId,
      conversationId: call.conversationId,
    })
  }
}
