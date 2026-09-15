import {
  broadcastToWorkspaceParty,
  contactInboxService,
  conversationService,
  sendToWorkspaceMember,
  whatsappVoipCallService,
} from "@chatbotx.io/business"
import {
  createMessageRepository,
  integrationWhatsappRepository,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { emitCallEnded, emitMissedAudioCall } from "@chatbotx.io/events"
import {
  RealtimeEventType,
  type RealtimeEventWhatsappCallTransportEnded,
} from "@chatbotx.io/partysocket-config"
import {
  getWhatsappCallEntity,
  type MessageWhatsappCallEntity,
  resolveWhatsappCallActivityLabelKey,
  type WhatsappCallActivityLabelKey,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../../lib/logger"

/**
 * The per-number "Record calls" / "Transcribe calls" toggles at finalize
 * time. Read fresh from the integration (rather than cached on the call row):
 * the toggles can change between calls, and these only feed the flags stamped
 * on the activity card, never gate the actual pipelines (each enrichment
 * handler re-checks its own conditions). The card uses `recordingRequested`
 * to decide whether to show a "processing…" placeholder at all — a call with
 * recording off shows no player row instead of one that never resolves.
 */
export const resolveCallActivityRequestFlags = async (
  call: Pick<WhatsappCallModel, "inboxId" | "workspaceId">,
): Promise<{
  recordingRequested: boolean
  transcriptionRequested: boolean
}> => {
  const integration =
    await integrationWhatsappRepository.findByInboxIdForWorkspace({
      inboxId: call.inboxId,
      workspaceId: call.workspaceId,
    })
  return {
    recordingRequested: Boolean(integration?.callRecordingEnabled),
    transcriptionRequested: Boolean(integration?.callTranscriptionEnabled),
  }
}

/**
 * Deterministic, id-based sourceId: stable regardless of WHICH path — the
 * Meta `terminate` webhook or the local hangup — reaches a terminal state
 * first, so both converge on exactly one activity message (`createOrUpdate`
 * dedups on `sourceId`; the second caller is a no-op that returns the
 * existing row, `isNew: false`).
 */
export const callActivitySourceId = (callId: string): string =>
  `wacall-${callId}`

const formatDuration = (durationSeconds: number): string => {
  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * Ring wait in whole seconds: answered time (`start_time`) minus placed time
 * (the row's `createdAt`). Returns `undefined` when either timestamp is
 * missing, or when the difference is negative (a never-answered call, or a
 * terminate that raced ahead of the row insert) — the header then simply
 * omits the sub-label rather than show a bogus or total-call duration.
 */
const resolveAnswerSeconds = (
  startedAt: Date | null | undefined,
  createdAt: Date | null | undefined,
): number | undefined => {
  if (!(startedAt && createdAt)) {
    return
  }
  const seconds = Math.round((startedAt.getTime() - createdAt.getTime()) / 1000)
  return seconds >= 0 ? seconds : undefined
}

/**
 * English fallback text stored on the activity message — used by previews
 * and exports. The inbox itself renders a localized label from
 * `contentAttributes` instead (see `RenderContentAttributes`).
 */
/**
 * English fallbacks keyed by the SAME {@link WhatsappCallActivityLabelKey} the
 * inbox card localizes — the shared key mapping
 * ({@link resolveWhatsappCallActivityLabelKey}) is what keeps the stored
 * snippet text and the rendered card from ever disagreeing.
 */
const CALL_ACTIVITY_ENGLISH: Record<WhatsappCallActivityLabelKey, string> = {
  declinedVoiceCall: "Declined voice call",
  missedVoiceCall: "Missed voice call",
  unansweredVoiceCall: "No answer",
  canceledVoiceCall: "Cancelled call",
}

/**
 * Collapses the display-only `canceled` entity status back to the persisted
 * set (DB `WhatsappCall.status` + the realtime ended event): `canceled` is a
 * UI-only refinement of a `failed` outbound call — it lives on the activity
 * message's `contentAttributes`, never in the call row's own status column.
 */
const toPersistedCallStatus = (
  status: MessageWhatsappCallEntity["status"],
): "completed" | "failed" | "rejected" =>
  status === "canceled" ? "failed" : status

export const buildCallActivityText = (
  entity: MessageWhatsappCallEntity,
): string => {
  if (entity.status === "completed") {
    return entity.durationSeconds === undefined
      ? "Voice call"
      : `Voice call · ${formatDuration(entity.durationSeconds)}`
  }
  return CALL_ACTIVITY_ENGLISH[
    resolveWhatsappCallActivityLabelKey(entity.status, entity.direction)
  ]
}

/**
 * Tells the agent's browser the call is over and tears down its signaling
 * state.
 *
 * The Redis control record is read BEFORE `endCall` so an agent who claimed
 * the call but never reached `accepted` (rejected, or expired mid-answer)
 * still gets the dismiss signal. Delivery is targeted with
 * `sendToWorkspaceMember` once a single agent has claimed the call
 * (`control.reservedUserId` is set), since the event is only meaningful to
 * the agent holding the offer. An UNCLAIMED call (ring-all,
 * `reservedUserId === ""` — nobody answered yet, e.g. the caller hung up
 * mid-ring or the offer expired) has no single agent to dismiss while every
 * rung agent's dialog is still ringing, so the same event is BROADCAST to
 * the workspace instead; the client's `handleEnded` ignores any call it
 * doesn't recognize as its own, which makes that safe for agents who were
 * never rung. No control record at all means nobody was ever rung, so there
 * is nothing to clear. `endCall`/`deleteOffer` are idempotent no-ops when
 * the signaling consumer already ran them before the Graph call that led
 * here.
 */
const emitCallEndedToAgent = async (
  call: WhatsappCallModel,
  status: "completed" | "failed" | "rejected",
): Promise<void> => {
  if (!call.wacid) {
    return
  }
  const wacid = call.wacid

  const control = await whatsappVoipCallService.readControl(wacid)
  // This is terminal cleanup after the Graph call already ended the call, so
  // ending from `accepted` is expected here (`allowFromAccepted:true`).
  await whatsappVoipCallService.endCall({ wacid, allowFromAccepted: true })
  await whatsappVoipCallService.deleteOffer(wacid)

  // No control record at all: nobody was ever rung, so there's nothing to
  // clear.
  if (!control) {
    return
  }

  const data: RealtimeEventWhatsappCallTransportEnded["data"] = {
    transport: "voip",
    whatsappCallId: call.id,
    wacid,
    status,
  }
  const eventPayload = {
    eventType: RealtimeEventType.whatsappCallTransportEnded,
    data,
  } as const

  try {
    // Unclaimed (still ringing every eligible agent): broadcast so every
    // rung agent's dialog clears immediately, instead of waiting out each
    // client's own ~55s deadline timer.
    if (control.reservedUserId === "") {
      await broadcastToWorkspaceParty(call.workspaceId, eventPayload)
      return
    }
    await sendToWorkspaceMember(
      { workspaceId: call.workspaceId, userId: control.reservedUserId },
      eventPayload,
    )
  } catch (error) {
    logger.warn(
      { err: error, callId: call.id },
      "Whatsapp call: unable to emit whatsappCallTransportEnded",
    )
  }
}

export type FinalizeCallSideEffectsInput = {
  call: WhatsappCallModel
  entity: MessageWhatsappCallEntity
  /** Preferred over `new Date()` when a real terminal timestamp is known (Meta's webhook). */
  endedAt?: Date | null
  /** Only written when provided — omitting it never clears an already-set column. */
  startedAt?: Date | null
  /**
   * Diagnosis string derived from a terminate webhook's `errors[]` (media-drop
   * codes 138021/138022/138023, etc). Only written when provided — omitting
   * it never clears an already-set column.
   */
  lastError?: string | null
}

/**
 * The single terminate side-effect block every terminal path shares: activity
 * message (dedup'd on the id-based `sourceId`), the id-based status write,
 * flow-state/tracking updates, the realtime `messageCreated` broadcast, and
 * the `callEnded`/`missedAudioCall` trigger events — all guarded on the
 * winning message insert (`isNew`) so a redelivery or a second path never
 * re-fires any of them.
 */
export const finalizeCallSideEffects = async (
  input: FinalizeCallSideEffectsInput,
): Promise<void> => {
  const { call, entity: partialEntity } = input
  const endedAt = input.endedAt ?? new Date()

  // Time-to-answer (ring wait): the answered timestamp (`start_time`) minus
  // when the call was placed/started ringing (the row's `createdAt`, stamped
  // on the `connect` webhook / outbound dial). Shown under the "Audio call"
  // header — distinct from the talk-time `durationSeconds` in the player.
  const answerSeconds = resolveAnswerSeconds(input.startedAt, call.createdAt)
  const { recordingRequested, transcriptionRequested } =
    await resolveCallActivityRequestFlags(call)

  // The finalize message IS the single progressive activity card — it carries
  // the full flag set from the start (all false/unknown until the
  // recording/transcript/summary handlers enrich it in place via
  // `enrichCallActivityMessage`), never just direction/status.
  const entity: MessageWhatsappCallEntity = {
    ...partialEntity,
    callId: call.id,
    ...(answerSeconds === undefined ? {} : { answerSeconds }),
    hasRecording: false,
    recordingRequested,
    transcriptionRequested,
    hasTranscript: false,
    hasSummary: false,
    recordingExpired: false,
  }

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
    status: toPersistedCallStatus(entity.status),
    ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    endedAt,
    durationSeconds: entity.durationSeconds ?? null,
    messageId: message.id,
    ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
    current: call,
  })

  if (!isNew) {
    return
  }

  await emitCallEndedToAgent(call, toPersistedCallStatus(entity.status))

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

/**
 * Thrown by {@link enrichCallActivityMessage} when the finalize message
 * still hasn't been written after the bounded in-process wait below — a race
 * where a recording/transcript job's webhook reached this pipeline before
 * `finalizeCallSideEffects` finished. Every current caller of this function
 * is invoked from a handler that gates its own re-entry on a one-time CAS
 * column (`WhatsappCall.recordedAt`/`transcript`), so once that CAS has won,
 * a BullMQ-level retry of the OUTER job can never reach this function again
 * — the bounded wait is the only real chance to converge. This is still
 * thrown (rather than silently swallowed) so the failure is observable
 * (logs/dead-letter) instead of vanishing.
 */
export class WhatsappCallEnrichmentPendingError extends Error {
  constructor(callId: string) {
    super(
      `whatsapp-call-enrichment-pending: finalize message not found for callId ${callId} after bounded wait`,
    )
    this.name = "WhatsappCallEnrichmentPendingError"
  }
}

/** Total bounded wait ≈ 3.5s across 4 attempts — long enough to absorb the
 * ordinary webhook-arrival jitter between `finalizeCallSideEffects` and a
 * recording/transcript job, short enough to never stall a worker slot. */
const CALL_FINALIZE_WAIT_DELAYS_MS = [500, 1000, 2000]

/**
 * Safety margin subtracted from the call's `createdAt` when computing the
 * `sinceTime` lower bound for the sharded `Message` lookup — absorbs any minor
 * clock skew between the call row and its activity-message write so the shard
 * range can never start just after the message.
 */
const CALL_MESSAGE_SHARD_LOOKBACK_MS = 5 * 60 * 1000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Bounded in-process retry: calls `read` immediately, then again after
 * each delay in `delays`, stopping as soon as `isReady` accepts a value.
 * Returns the LAST value read regardless of readiness — callers decide how
 * to treat a still-not-ready result. Exported so `whatsapp-call-recording.ts`
 * reuses the exact same wait discipline for the sibling
 * "finalize row not stamped yet" race on `WhatsappCall.messageId`.
 */
export const waitUntilReady = async <T>(
  read: () => Promise<T>,
  isReady: (value: T) => boolean,
  delays: readonly number[] = CALL_FINALIZE_WAIT_DELAYS_MS,
): Promise<T> => {
  let value = await read()
  for (const delay of delays) {
    if (isReady(value)) {
      return value
    }
    await sleep(delay)
    value = await read()
  }
  return value
}

const defaultCallEntity = (
  call: Pick<WhatsappCallModel, "id" | "direction">,
  overrides: Partial<
    Pick<
      MessageWhatsappCallEntity,
      "hasRecording" | "hasTranscript" | "hasSummary" | "recordingExpired"
    >
  >,
): MessageWhatsappCallEntity => ({
  type: "whatsapp_call",
  direction: call.direction,
  status: "completed",
  callId: call.id,
  transcriptionRequested: false,
  hasRecording: false,
  hasTranscript: false,
  hasSummary: false,
  recordingExpired: false,
  ...overrides,
})

/**
 * Enriches the SINGLE progressive `whatsapp_call` finalize message in place
 * — the recording/transcript-fetch handlers call this
 * instead of creating a second `whatsapp_call_recording` message.
 *
 * Merges ONLY `overrides` into the message's `contentAttributes` via a
 * single atomic `jsonb ||` UPDATE (`mergeContentAttributesBySourceId`) —
 * never a read-modify-write — so two independent, disjoint-column writers
 * (recording vs transcript, each racing on its own webhook/job) can never
 * clobber the other's already-applied flag.
 *
 * Waits (bounded, see {@link waitUntilReady}) for the finalize message to
 * exist before merging — an unlikely race where enrichment runs before
 * `finalizeCallSideEffects` finished. Throws
 * {@link WhatsappCallEnrichmentPendingError} rather than silently returning
 * when the message still isn't there after the bounded wait (see that
 * error's doc comment for why a caller-level retry cannot help here). The
 * realtime broadcast itself is still best-effort — a failed push must not
 * fail (and retry) an already-successful DB write.
 */
export const enrichCallActivityMessage = async (props: {
  call: Pick<
    WhatsappCallModel,
    "id" | "conversationId" | "workspaceId" | "direction" | "createdAt"
  >
  overrides: Partial<
    Pick<
      MessageWhatsappCallEntity,
      "hasRecording" | "hasTranscript" | "hasSummary" | "recordingExpired"
    >
  >
}): Promise<void> => {
  const { call, overrides } = props
  const sourceId = callActivitySourceId(call.id)
  const repository = await createMessageRepository()

  // The sharded `Message` repository needs a `sinceTime` to know which time
  // shard(s) to scan. The finalize activity message is created at call end
  // (`createdAt: endedAt`), so the call's own `createdAt` (when it started
  // ringing) is always at or before it — a valid, tight lower bound. A small
  // margin absorbs any clock skew between the row and the message write.
  const sinceTime = new Date(
    call.createdAt.getTime() - CALL_MESSAGE_SHARD_LOOKBACK_MS,
  )

  const existing = await waitUntilReady(
    () =>
      repository.findBySourceId(
        sourceId,
        call.conversationId,
        call.workspaceId,
        sinceTime,
      ),
    (message) => message !== null,
  )
  if (!existing) {
    logger.warn(
      { callId: call.id },
      "Whatsapp call: no finalize message to enrich after bounded wait",
    )
    throw new WhatsappCallEnrichmentPendingError(call.id)
  }

  const merged = await repository.mergeContentAttributesBySourceId(
    sourceId,
    call.workspaceId,
    overrides,
  )
  if (!merged) {
    logger.warn(
      { callId: call.id },
      "Whatsapp call: enrichment merge matched no row",
    )
    return
  }

  const entity =
    getWhatsappCallEntity(merged.contentAttributes) ??
    defaultCallEntity(call, overrides)

  try {
    await broadcastToWorkspaceParty(call.workspaceId, {
      eventType: RealtimeEventType.messageContentUpdated,
      data: { messageId: merged.id, contentAttributes: entity },
    })
  } catch (error) {
    logger.warn(
      { err: error, callId: call.id },
      "Whatsapp call: unable to emit realtime enrichment event",
    )
  }
}
