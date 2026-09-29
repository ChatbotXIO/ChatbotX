import {
  broadcastToWorkspaceParty,
  contactInboxService,
  conversationService,
  sendToWorkspaceMember,
  userService,
  whatsappVoipCallService,
  whatsappVoipSignalingService,
} from "@chatbotx.io/business"
import {
  resolveWhatsappCallTerminalOutcomePair,
  type WhatsappCallTerminalStatusOutcomePair,
} from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  integrationWhatsappRepository,
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
import { transcribesCalls } from "@chatbotx.io/utils/whatsapp-call"
import { logger } from "../../../lib/logger"

/**
 * Per-number recording/transcript toggles, read fresh (not cached on the call
 * row) since they can change between calls. They only feed flags on the
 * activity card and never gate the actual pipelines.
 */
export const resolveCallActivityRequestFlags = async (
  call: Pick<
    WhatsappCallModel,
    "inboxId" | "workspaceId" | "recordingRequested"
  >,
): Promise<{
  recordingRequested: boolean
  transcriptionRequested: boolean
  recordingUnavailable: boolean
}> => {
  const integration =
    await integrationWhatsappRepository.findByInboxIdForWorkspace({
      inboxId: call.inboxId,
      workspaceId: call.workspaceId,
    })
  const recordsCalls = Boolean(integration?.callRecordingEnabled)
  // The row records what this call actually arranged; the toggle is only a
  // fallback for rows written before this column existed.
  return {
    recordingRequested: call.recordingRequested ?? recordsCalls,
    transcriptionRequested: integration ? transcribesCalls(integration) : false,
    // Only a number that records calls can have a MISSING recording worth
    // reporting.
    recordingUnavailable: call.recordingRequested === false && recordsCalls,
  }
}

/**
 * Deterministic id-based sourceId so whichever path (Meta terminate webhook or
 * local hangup) reaches terminal state first, both converge on one activity
 * message via createOrUpdate dedup.
 */
export const callActivitySourceId = (callId: string): string =>
  `wacall-${callId}`

const formatDuration = (durationSeconds: number): string => {
  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * Ring wait in seconds: start_time minus createdAt. Undefined when either
 * timestamp is missing or negative (never-answered, or a race) — header omits
 * the sub-label instead of showing a bogus duration.
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
 * English fallback for previews/exports, keyed by the label key the inbox
 * card localizes from contentAttributes.
 */
const CALL_ACTIVITY_ENGLISH: Record<WhatsappCallActivityLabelKey, string> = {
  declinedVoiceCall: "Declined voice call",
  missedVoiceCall: "Missed voice call",
  unansweredVoiceCall: "No answer",
  canceledVoiceCall: "Cancelled call",
}

/**
 * Collapses the display-only canceled entity status back to the persisted set:
 * canceled is a UI-only refinement of a failed outbound call, living only in
 * contentAttributes.
 */
const toPersistedCallStatus = (
  status: MessageWhatsappCallEntity["status"],
): "completed" | "failed" | "rejected" =>
  status === "canceled" ? "failed" : status

/**
 * entity.status is read before canceled collapses into failed, so a canceled
 * entity persists outcome: canceled alongside DB status: failed. Delegates to
 * resolveWhatsappCallTerminalOutcomePair as the single place this pairing
 * lives.
 */
const toFinalizeStatusOutcome = (
  status: MessageWhatsappCallEntity["status"],
): WhatsappCallTerminalStatusOutcomePair =>
  resolveWhatsappCallTerminalOutcomePair({
    status: toPersistedCallStatus(status),
    canceledByBusiness: status === "canceled",
  })

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
 * Tells the agent's browser the call is over and tears down signaling state.
 * Reads the Redis control record before endCall so a claimed-but-not-accepted
 * agent still gets dismissed; targets reservedUserId if set, else broadcasts
 * (clients ignore calls they don't recognize). No record means nobody was rung.
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
  // Terminal cleanup after the Graph call already ended it, so ending from
  // accepted is expected (allowFromAccepted:true).
  await whatsappVoipCallService.endCall({ wacid, allowFromAccepted: true })
  await whatsappVoipSignalingService.deleteOffer(wacid)

  // No control record: nobody was ever rung, nothing to clear.
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
    // Unclaimed call: broadcast so every rung agent's dialog clears immediately
    // instead of waiting out its own ~55s deadline timer.
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

/**
 * Agent display-name snapshot, resolved once at finalize time so a later rename
 * or deletion can't rewrite history. Skips lookup when there's no id.
 * Never throws: a lookup failure just leaves the id stamped with no name.
 */
const resolveCallAgentSnapshot = async (
  answeredByUserId: string | null | undefined,
): Promise<Pick<MessageWhatsappCallEntity, "agentUserId" | "agentName">> => {
  if (!answeredByUserId) {
    return {}
  }
  try {
    const user = await userService.findNameAndEmail(answeredByUserId)
    return {
      agentUserId: answeredByUserId,
      ...(user?.name ? { agentName: user.name } : {}),
    }
  } catch (error) {
    logger.warn(
      { err: error, userId: answeredByUserId },
      "Whatsapp call: unable to resolve agent name for call activity card",
    )
    return { agentUserId: answeredByUserId }
  }
}

type CustomerServiceWindowFacts = {
  status: MessageWhatsappCallEntity["status"]
  /** When the call was placed / started ringing. */
  placedAt: Date
  /** When the call was answered, per Meta. */
  answeredAt: Date | null | undefined
}

/**
 * When a finished call opened (or refreshed) WhatsApp's 24h customer service
 * window, by direction; null when it did not. Per Meta's calling pricing docs,
 * the window opens on any call attempt or acceptance.
 * Falls back to placedAt when no answer time is reported, so the shown window
 * can only be shorter than Meta's, never longer.
 */
const CUSTOMER_SERVICE_WINDOW_OPENED_AT: Record<
  MessageWhatsappCallEntity["direction"],
  (facts: CustomerServiceWindowFacts) => Date | null
> = {
  userInitiated: ({ placedAt }) => placedAt,
  businessInitiated: ({ status, answeredAt, placedAt }) =>
    status === "completed" ? (answeredAt ?? placedAt) : null,
}

export type FinalizeCallSideEffectsInput = {
  call: WhatsappCallModel
  entity: MessageWhatsappCallEntity
  /**
   * Preferred over new Date() when a real terminal timestamp (Meta's webhook)
   * is known.
   */
  endedAt?: Date | null
  /** Only written when provided — omitting it never clears an already-set column. */
  startedAt?: Date | null
  /**
   * Diagnosis string from a terminate webhook's errors[] (media-drop codes
   * etc). Only written when provided.
   */
  lastError?: string | null
}

/**
 * The single terminate side-effect block every terminal path shares, all
 * guarded on the winning message insert (isNew) so a redelivery never re-fires
 * them.
 */
export const finalizeCallSideEffects = async (
  input: FinalizeCallSideEffectsInput,
): Promise<void> => {
  const { call, entity: partialEntity } = input
  const endedAt = input.endedAt ?? new Date()

  // Time-to-answer (ring wait): start_time minus createdAt. Distinct from talk-
  // time durationSeconds shown in the player.
  const answerSeconds = resolveAnswerSeconds(input.startedAt, call.createdAt)
  const { recordingRequested, transcriptionRequested, recordingUnavailable } =
    await resolveCallActivityRequestFlags(call)
  const agentSnapshot = await resolveCallAgentSnapshot(call.answeredByUserId)
  const windowOpenedAt = CUSTOMER_SERVICE_WINDOW_OPENED_AT[
    partialEntity.direction
  ]({
    status: partialEntity.status,
    placedAt: call.createdAt,
    answeredAt: input.startedAt,
  })

  // The finalize message is the single progressive activity card, carrying the
  // full flag set from the start until enrichCallActivityMessage fills it in.
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
    recordingUnavailable,
    ...agentSnapshot,
    ...(windowOpenedAt
      ? { customerServiceWindowOpenedAt: windowOpenedAt.toISOString() }
      : {}),
    // Surfaces Meta's own terminate diagnosis on the card so an agent sees why
    // there's no audio. Only stamped when Meta reported one.
    ...(input.lastError ? { failureReason: input.lastError } : {}),
  }

  // The card's promise to the agent: whether a recording/transcript is
  // expected, and whether we already know none is coming.
  logger.info(
    {
      callId: call.id,
      wacid: call.wacid,
      status: entity.status,
      recordingRequested,
      transcriptionRequested,
      recordingUnavailable,
    },
    "[wa-call-media] call card flags stamped",
  )

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

  await whatsappVoipCallService.finalizeEndedCall({
    whatsappCallId: call.id,
    ...toFinalizeStatusOutcome(entity.status),
    ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    endedAt,
    durationSeconds: entity.durationSeconds ?? null,
    messageId: message.id,
    ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
    current: call,
  })

  // Transport cleanup runs on every delivery, not just isNew, since a prior run
  // may have died after the insert. Each step is idempotent.
  await emitCallEndedToAgent(call, toPersistedCallStatus(entity.status))

  if (!isNew) {
    return
  }

  await conversationService.updateFlowStepState({
    workspaceId: call.workspaceId,
    conversationId: call.conversationId,
    lastActivityAt: message.createdAt,
    // A call the contact placed is contact activity the agent has not seen.
    ...(call.direction === "userInitiated"
      ? { contactRepliedAt: message.createdAt }
      : {}),
  })

  const contactInbox = await contactInboxService.findBy({
    where: { id: call.contactInboxId },
  })
  if (contactInbox) {
    const invalidation = await contactInboxService.updateTracking({
      contactInboxId: contactInbox.id,
      contactId: contactInbox.contactId,
      workspaceId: call.workspaceId,
      data: {
        lastMessageAt: message.createdAt,
        // The inbox gates free-form replies on this column, so a call Meta
        // counts as opening the window has to move it too.
        ...(windowOpenedAt ? { lastIncomingMessageAt: windowOpenedAt } : {}),
      },
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
 * Thrown when the finalize message still hasn't been written after the bounded
 * wait — a race with a recording/transcript webhook. Callers gate re-entry on a
 * one-time CAS column, so a BullMQ retry of the outer job can't reach this
 * again; the bounded wait is the only real convergence chance. Thrown rather
 * than swallowed so it's observable.
 */
export class WhatsappCallEnrichmentPendingError extends Error {
  constructor(callId: string) {
    super(
      `whatsapp-call-enrichment-pending: finalize message not found for callId ${callId} after bounded wait`,
    )
    this.name = "WhatsappCallEnrichmentPendingError"
  }
}

/**
 * Total bounded wait ≈3.5s across 4 attempts: enough to absorb webhook jitter,
 * short enough not to stall a worker slot.
 */
const CALL_FINALIZE_WAIT_DELAYS_MS = [500, 1000, 2000]

/**
 * Safety margin subtracted from createdAt for the sharded Message lookup's
 * sinceTime, absorbing clock skew between the call row and its activity-message
 * write.
 */
const CALL_MESSAGE_SHARD_LOOKBACK_MS = 5 * 60 * 1000

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Bounded in-process retry: reads immediately, then after each delay, stopping
 * once isReady accepts a value. Returns the last value regardless of readiness.
 * Exported for reuse by the sibling finalize-row race in whatsapp-call-
 * recording.ts.
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
 * Merges overrides into the finalize message via an atomic jsonb || UPDATE
 * (never read-modify-write), so racing writers can't clobber each other's
 * flags. Waits for the message to exist first, throwing
 * WhatsappCallEnrichmentPendingError if still missing after the bounded wait.
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

  // The finalize message is created at call end (createdAt: endedAt), so the
  // call's own createdAt is always at or before it — a valid, tight sinceTime
  // lower bound; the margin absorbs clock skew.
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

  logger.info(
    { callId: call.id, overrides },
    "[wa-call-media] call card enriched",
  )

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
