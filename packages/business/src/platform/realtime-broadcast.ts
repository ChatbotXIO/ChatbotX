import type {
  RealtimeEventData,
  RealtimeTargetedEventData,
} from "@chatbotx.io/realtime-protocol"
import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { logger } from "../logger"
import {
  markRealtimeMemberRevoked,
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests,
  retryWithLinearBackoff,
} from "./realtime-stream-publisher"

const WORKSPACE_REALTIME_COALESCE_MS = 25
const WORKSPACE_REALTIME_MAX_EVENTS = 64
const WORKSPACE_REALTIME_MAX_BYTES = 256 * 1024
const REALTIME_METRIC_WINDOW_MS = 10_000

const serializeWorkspaceEventsRecord = (
  workspaceId: string,
  serializedEvents: readonly string[],
): string => {
  const events = serializedEvents.join(",")
  return `{"events":[${events}],"kind":"workspace-events","workspaceId":${JSON.stringify(workspaceId)}}`
}
const IMMEDIATE_FLUSH_EVENT_TYPES: Partial<
  Record<RealtimeEventData["eventType"], true>
> = {
  [RealtimeEventType.conversationAssigned]: true,
  [RealtimeEventType.whatsappCallClaimedElsewhere]: true,
  [RealtimeEventType.whatsappCallPermissionUpdated]: true,
  [RealtimeEventType.whatsappCallTransportEnded]: true,
}

type PendingWorkspaceRealtimeEvents = {
  byteLength: number
  delivery: PromiseWithResolvers<void>
  serializedEvents: string[]
  timer: NodeJS.Timeout
}

const pendingByWorkspace = new Map<string, PendingWorkspaceRealtimeEvents>()
const inFlightByWorkspace = new Map<string, Promise<void>>()

const createEmptyRelayWindow = (): RealtimeRelayWindow => ({
  bytes: 0,
  errors: 0,
  eventTypes: {},
  events: 0,
  flushes: 0,
  maxBatchEvents: 0,
  windowStartedAt: Date.now(),
})

type RealtimeRelayWindow = {
  bytes: number
  errors: number
  eventTypes: Record<string, number>
  events: number
  flushes: number
  maxBatchEvents: number
  windowStartedAt: number
}

let relayWindow = createEmptyRelayWindow()

const relayWindowIsEmpty = (): boolean =>
  relayWindow.events === 0 &&
  relayWindow.flushes === 0 &&
  relayWindow.errors === 0

const flushRelayWindow = (force: boolean): void => {
  if (
    !force &&
    (Date.now() - relayWindow.windowStartedAt < REALTIME_METRIC_WINDOW_MS ||
      relayWindowIsEmpty())
  ) {
    return
  }
  if (relayWindowIsEmpty()) {
    return
  }
  logger.info(
    { metric: "realtime_relay", ...relayWindow },
    "realtime_relay_metric",
  )
  relayWindow = createEmptyRelayWindow()
}

const createPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): PendingWorkspaceRealtimeEvents => {
  const pending: PendingWorkspaceRealtimeEvents = {
    byteLength: Buffer.byteLength(
      serializeWorkspaceEventsRecord(workspaceId, []),
    ),
    delivery: Promise.withResolvers<void>(),
    serializedEvents: [],
    timer: setTimeout(
      () =>
        flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined),
      WORKSPACE_REALTIME_COALESCE_MS,
    ),
  }
  pendingByWorkspace.set(workspaceId, pending)
  return pending
}

/**
 * Flushes one workspace's coalesced event batch. Used for both the
 * coalescing flush timer and `flushAllPendingWorkspaceRealtimeEvents`'s
 * shutdown drain. Rejects when Redis cannot append it.
 */
const flushPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): Promise<void> => {
  const pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    return Promise.resolve()
  }

  pendingByWorkspace.delete(workspaceId)
  clearTimeout(pending.timer)
  if (pending.serializedEvents.length === 0) {
    return Promise.resolve()
  }

  relayWindow.flushes += 1
  relayWindow.maxBatchEvents = Math.max(
    relayWindow.maxBatchEvents,
    pending.serializedEvents.length,
  )

  const previousAppend =
    inFlightByWorkspace.get(workspaceId) ?? Promise.resolve()
  const append = previousAppend
    .catch(() => undefined)
    .then(() =>
      publishSerializedRealtimeStreamRecord(
        workspaceId,
        serializeWorkspaceEventsRecord(workspaceId, pending.serializedEvents),
      ),
    )
  append.then(
    () => {
      pending.delivery.resolve()
    },
    (error) => {
      relayWindow.errors += 1
      pending.delivery.reject(error)
    },
  )

  // Stores the RAW `append` (not a `.catch`-wrapped copy): the shutdown
  // drain's `Promise.allSettled` reads straight from this map, and a wrapped
  // promise that never rejects would make every in-flight append look like
  // it succeeded there even when Redis genuinely failed it. Map-cleanup uses
  // its own derived, always-settling chain instead, so a rejection here is
  // still observed exactly once (by the waiter-settling `.then` above) and
  // never surfaces as a second, unhandled rejection from this cleanup chain.
  inFlightByWorkspace.set(workspaceId, append)
  append
    .catch(() => undefined)
    .then(() => {
      if (inFlightByWorkspace.get(workspaceId) === append) {
        inFlightByWorkspace.delete(workspaceId)
      }
    })
  return append
}

export const resetRealtimePublishStateForTests = (): void => {
  for (const pending of pendingByWorkspace.values()) {
    clearTimeout(pending.timer)
    pending.delivery.resolve()
  }
  pendingByWorkspace.clear()
  inFlightByWorkspace.clear()
  resetRealtimeStreamPublisherForTests()
  relayWindow = createEmptyRelayWindow()
}

/**
 * Drains every workspace's coalesced batch and in-flight append independently
 * so one failed workspace does not hide another workspace's delivery result.
 */
export const flushAllPendingWorkspaceRealtimeEvents =
  async (): Promise<void> => {
    const pendingWorkspaceIds = [...pendingByWorkspace.keys()]
    const flushResults = await Promise.allSettled(
      pendingWorkspaceIds.map((workspaceId) =>
        flushPendingWorkspaceRealtimeEvents(workspaceId),
      ),
    )
    const failures: unknown[] = []
    for (const [index, result] of flushResults.entries()) {
      if (result.status === "rejected") {
        failures.push(result.reason)
        logger.error(
          { err: result.reason, workspaceId: pendingWorkspaceIds[index] },
          "Failed to flush pending realtime events on shutdown",
        )
      }
    }
    const inFlightEntries = [...inFlightByWorkspace.entries()]
    const inFlightResults = await Promise.allSettled(
      inFlightEntries.map(([, append]) => append),
    )
    for (const [index, result] of inFlightResults.entries()) {
      if (result.status === "rejected") {
        failures.push(result.reason)
        logger.error(
          { err: result.reason, workspaceId: inFlightEntries[index]?.[0] },
          "Failed to drain an in-flight realtime append on shutdown",
        )
      }
    }
    flushRelayWindow(true)
    // Every workspace above got its own fully-drained attempt and its own log
    // line, while the caller still receives one overall failure after every
    // possible flush has completed.
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} realtime flush(es) failed during shutdown`,
      )
    }
  }

/**
 * Coalesces workspace events for a short interval while preserving append order
 * per workspace. Resolves only after the corresponding Redis stream append.
 */
export const publishWorkspaceRealtimeEvent = (
  workspaceId: string,
  event: RealtimeEventData,
): Promise<void> => {
  flushRelayWindow(false)
  let pending =
    pendingByWorkspace.get(workspaceId) ??
    createPendingWorkspaceRealtimeEvents(workspaceId)

  const serializedEvent = JSON.stringify(event)
  const serializedEventBytes = Buffer.byteLength(serializedEvent)
  relayWindow.events += 1
  relayWindow.bytes += serializedEventBytes
  relayWindow.eventTypes[event.eventType] =
    (relayWindow.eventTypes[event.eventType] ?? 0) + 1
  const separatorBytes = pending.serializedEvents.length > 0 ? 1 : 0
  const wouldExceedBytes =
    pending.byteLength + separatorBytes + serializedEventBytes >
    WORKSPACE_REALTIME_MAX_BYTES
  const wouldExceedCount =
    pending.serializedEvents.length + 1 > WORKSPACE_REALTIME_MAX_EVENTS

  if (wouldExceedBytes || wouldExceedCount) {
    flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined)
    pending = createPendingWorkspaceRealtimeEvents(workspaceId)
  }

  const nextSeparatorBytes = pending.serializedEvents.length > 0 ? 1 : 0
  pending.serializedEvents.push(serializedEvent)
  pending.byteLength += nextSeparatorBytes + serializedEventBytes
  const delivery = pending.delivery.promise

  if (
    IMMEDIATE_FLUSH_EVENT_TYPES[event.eventType] === true ||
    pending.serializedEvents.length === WORKSPACE_REALTIME_MAX_EVENTS
  ) {
    flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined)
  }
  return delivery
}

/**
 * Queues a workspace event without making the caller wait for stream delivery.
 * Redis append failures remain visible in logs.
 */
export const queueWorkspaceRealtimeEvent = (
  workspaceId: string,
  event: RealtimeEventData,
): void => {
  publishWorkspaceRealtimeEvent(workspaceId, event).catch((error) => {
    logger.error(
      { err: error, eventType: event.eventType, workspaceId },
      "Failed to publish realtime event",
    )
  })
}

/**
 * Delivers an event to one workspace member's active realtime connections.
 * Resolves after Redis accepts the command and rejects on append failure.
 */
export const publishWorkspaceMemberRealtimeEvent = async (
  args: { workspaceId: string; userId: string },
  event: RealtimeTargetedEventData,
): Promise<void> => {
  await publishRealtimeStreamRecord({
    event,
    kind: "member-send",
    workspaceId: args.workspaceId,
    userId: args.userId,
  })
}

const REVOKE_RETRY_ATTEMPTS = 3
const REVOKE_RETRY_DELAY_MS = 250

type WorkspaceMemberRealtimeConnectionRevocationArgs = {
  reason: "deleted" | "reauth"
  userId: string
  workspaceId: string
}

/**
 * Immediately revokes existing realtime connections and prevents reconnects
 * with tokens minted before the revoke marker.
 */
export const revokeWorkspaceMemberRealtimeConnections = async (
  args: WorkspaceMemberRealtimeConnectionRevocationArgs,
): Promise<void> => {
  await retryWithLinearBackoff(
    async () => {
      await markRealtimeMemberRevoked(args.workspaceId, args.userId)
      await publishRealtimeStreamRecord({
        kind: "member-revoke",
        reason: args.reason,
        workspaceId: args.workspaceId,
        userId: args.userId,
      })
    },
    {
      attempts: REVOKE_RETRY_ATTEMPTS,
      baseDelayMs: REVOKE_RETRY_DELAY_MS,
      workspaceId: args.workspaceId,
    },
  )
}

/**
 * Best-effort revocation that never throws. Returns `false` only when all
 * retries fail.
 */
export const tryRevokeWorkspaceMemberRealtimeConnections = async (
  args: WorkspaceMemberRealtimeConnectionRevocationArgs & {
    errorMessage: string
  },
): Promise<boolean> => {
  try {
    await revokeWorkspaceMemberRealtimeConnections(args)
    return true
  } catch (error) {
    logger.error(
      { err: error, userId: args.userId, workspaceId: args.workspaceId },
      args.errorMessage,
    )
    return false
  }
}

/** Publishes an event to a guest conversation's active realtime connections. */
export const publishGuestRealtimeEvent = async (
  args: { workspaceId: string; guestConversationId: string },
  event: RealtimeTargetedEventData,
): Promise<void> => {
  await publishRealtimeStreamRecord({
    event,
    guestConversationId: args.guestConversationId,
    kind: "guest-event",
    workspaceId: args.workspaceId,
  })
}
