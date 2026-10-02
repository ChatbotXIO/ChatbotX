import type { RealtimeEventData } from "@chatbotx.io/realtime-protocol"
import { logger } from "../logger"
import {
  REALTIME_METRIC_WINDOW_MS,
  type RealtimeRelayWindow,
  recordRealtimeRelayWindow,
} from "./realtime-metrics"
import {
  publishRealtimeStreamRecord,
  publishSerializedRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests,
} from "./realtime-stream-publisher"

export const WORKSPACE_REALTIME_COALESCE_MS = 25
export const WORKSPACE_REALTIME_MAX_EVENTS = 64
export const WORKSPACE_REALTIME_MAX_BYTES = 256 * 1024

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
  events: RealtimeEventData[]
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

const appendWorkspaceRealtimeEvents = async (
  workspaceId: string,
  pending: PendingWorkspaceRealtimeEvents,
): Promise<void> => {
  const serializedRecord = `{"events":[${pending.serializedEvents.join(",")}],"kind":"workspace-events","workspaceId":${JSON.stringify(workspaceId)}}`
  await publishSerializedRealtimeStreamRecord(workspaceId, serializedRecord)
}

const createPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): PendingWorkspaceRealtimeEvents => {
  const pending: PendingWorkspaceRealtimeEvents = {
    byteLength: BATCH_ENVELOPE_BYTES,
    events: [],
    serializedEvents: [],
    timer: setTimeout(
      () =>
        flushPendingWorkspaceRealtimeEvents(workspaceId).catch((error) => {
          logger.error(
            { err: error, workspaceId },
            "Failed to publish realtime events",
          )
        }),
      WORKSPACE_REALTIME_COALESCE_MS,
    ),
    waiters: [],
  }
  pendingByWorkspace.set(workspaceId, pending)
  return pending
}

/**
 * Flushes one workspace's coalesced event batch. Exported for deterministic
 * shutdown draining and focused tests. Rejects when Redis cannot append it.
 */
export const flushPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): Promise<void> => {
  const pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    return Promise.resolve()
  }

  pendingByWorkspace.delete(workspaceId)
  clearTimeout(pending.timer)
  if (pending.events.length === 0) {
    return Promise.resolve()
  }

  relayWindow.flushes += 1
  relayWindow.maxBatchEvents = Math.max(
    relayWindow.maxBatchEvents,
    pending.events.length,
  )

  const previousAppend =
    inFlightByWorkspace.get(workspaceId) ?? Promise.resolve()
  const append = previousAppend.then(() =>
    appendWorkspaceRealtimeEvents(workspaceId, pending),
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

  const continuation = append.catch(() => undefined)
  inFlightByWorkspace.set(workspaceId, continuation)
  continuation.then(() => {
    if (inFlightByWorkspace.get(workspaceId) === continuation) {
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

export const flushAllPendingWorkspaceRealtimeEvents =
  async (): Promise<void> => {
    const pendingWorkspaceIds = [...pendingByWorkspace.keys()]
    await Promise.all(
      pendingWorkspaceIds.map((workspaceId) =>
        flushPendingWorkspaceRealtimeEvents(workspaceId),
      ),
    )
    await Promise.all(inFlightByWorkspace.values())
    if (!relayWindowIsEmpty()) {
      recordRealtimeRelayWindow(relayWindow)
      relayWindow = createEmptyRelayWindow()
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
  const separatorBytes = pending.events.length > 0 ? 1 : 0
  const wouldExceedBytes =
    pending.byteLength + separatorBytes + serializedEventBytes >
    WORKSPACE_REALTIME_MAX_BYTES
  const wouldExceedCount =
    pending.events.length + 1 > WORKSPACE_REALTIME_MAX_EVENTS

  if (wouldExceedBytes || wouldExceedCount) {
    flushPendingWorkspaceRealtimeEvents(workspaceId).catch(() => undefined)
    pending = createPendingWorkspaceRealtimeEvents(workspaceId)
  }

  const nextSeparatorBytes = pending.events.length > 0 ? 1 : 0
  pending.events.push(event)
  pending.serializedEvents.push(serializedEvent)
  pending.byteLength += nextSeparatorBytes + serializedEventBytes
  const { promise: delivery, reject, resolve } = Promise.withResolvers<void>()
  pending.waiters.push({ reject, resolve })

  if (
    IMMEDIATE_FLUSH_EVENT_TYPES.has(event.eventType) ||
    pending.events.length === WORKSPACE_REALTIME_MAX_EVENTS
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
  event: RealtimeEventData,
): Promise<void> => {
  await publishRealtimeStreamRecord({
    event,
    kind: "member-send",
    workspaceId: args.workspaceId,
    userId: args.userId,
  })
}

/** Immediately revokes a member's existing realtime connections. */
export const revokeWorkspaceMemberRealtimeConnections = async (args: {
  workspaceId: string
  userId: string
}): Promise<void> => {
  await publishRealtimeStreamRecord({
    kind: "member-revoke",
    workspaceId: args.workspaceId,
    userId: args.userId,
  })
}

/** Publishes an event to a guest conversation's active realtime connections. */
export const publishGuestRealtimeEvent = async (
  args: { workspaceId: string; guestConversationId: string },
  event: RealtimeEventData,
): Promise<void> => {
  await publishRealtimeStreamRecord({
    event,
    guestConversationId: args.guestConversationId,
    kind: "guest-event",
    workspaceId: args.workspaceId,
  })
}
