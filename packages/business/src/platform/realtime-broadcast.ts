import type {
  RealtimeEventData,
  RealtimeTargetedEventData,
} from "@chatbotx.io/realtime-protocol"
import { logger } from "../logger"
import {
  REALTIME_METRIC_WINDOW_MS,
  type RealtimeRelayWindow,
  recordRealtimeRelayWindow,
} from "./realtime-metrics"
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

const BATCH_ENVELOPE_BYTES = Buffer.byteLength('{"batch":[]}')
const IMMEDIATE_FLUSH_EVENT_TYPES = new Set([
  "conversationAssigned",
  "whatsappCallClaimedElsewhere",
  "whatsappCallOutboundAnswer",
  "whatsappCallOutboundStatus",
  "whatsappCallPermissionUpdated",
  "whatsappCallTransportEnded",
  "whatsappCallTransportIncoming",
])

type PendingWorkspaceRealtimeEvents = {
  byteLength: number
  serializedEvents: string[]
  timer: NodeJS.Timeout
  waiters: {
    reject: (error: unknown) => void
    resolve: () => void
  }[]
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

let relayWindow = createEmptyRelayWindow()

const relayWindowIsEmpty = (): boolean =>
  relayWindow.events === 0 &&
  relayWindow.flushes === 0 &&
  relayWindow.errors === 0

const flushRelayWindowIfElapsed = (): void => {
  if (
    Date.now() - relayWindow.windowStartedAt < REALTIME_METRIC_WINDOW_MS ||
    relayWindowIsEmpty()
  ) {
    return
  }
  recordRealtimeRelayWindow(relayWindow)
  relayWindow = createEmptyRelayWindow()
}

const createPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): PendingWorkspaceRealtimeEvents => {
  const pending: PendingWorkspaceRealtimeEvents = {
    byteLength: BATCH_ENVELOPE_BYTES,
    serializedEvents: [],
    timer: setTimeout(
      () =>
        flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined),
      WORKSPACE_REALTIME_COALESCE_MS,
    ),
    waiters: [],
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
        `{"events":[${pending.serializedEvents.join(",")}],"kind":"workspace-events","workspaceId":${JSON.stringify(workspaceId)}}`,
      ),
    )
  append.then(
    () => {
      for (const waiter of pending.waiters) {
        waiter.resolve()
      }
    },
    (error) => {
      relayWindow.errors += 1
      for (const waiter of pending.waiters) {
        waiter.reject(error)
      }
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
    for (const waiter of pending.waiters) {
      waiter.resolve()
    }
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
    if (!relayWindowIsEmpty()) {
      recordRealtimeRelayWindow(relayWindow)
      relayWindow = createEmptyRelayWindow()
    }
    // Every workspace above got its own fully-drained attempt and its own
    // log line regardless of any other workspace's outcome (the bug this
    // fixes) — but the caller's shutdown handler still needs an overall
    // rejection to know whether to exit 0 or 1, so re-raise once everything
    // that COULD run already has.
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
  flushRelayWindowIfElapsed()
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
  const { promise: delivery, reject, resolve } = Promise.withResolvers<void>()
  pending.waiters.push({ reject, resolve })

  if (
    IMMEDIATE_FLUSH_EVENT_TYPES.has(event.eventType) ||
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
 * Immediately revokes a member's existing realtime connections and marks
 * future connections as revoked.
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
