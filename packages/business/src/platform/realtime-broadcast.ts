import type { RealtimeEventData } from "@chatbotx.io/realtime-protocol"
import { REALTIME_EVENT_TOPICS } from "@chatbotx.io/realtime-protocol"
import { logger } from "../logger"
import {
  publishRealtimeStreamRecord,
  resetRealtimeStreamPublisherForTests,
} from "./realtime-stream-publisher"

export const WORKSPACE_REALTIME_COALESCE_MS = 25
export const WORKSPACE_REALTIME_MAX_EVENTS = 64
export const WORKSPACE_REALTIME_MAX_BYTES = 256 * 1024

const BATCH_ENVELOPE_BYTES = new TextEncoder().encode('{"batch":[]}').byteLength

type PendingWorkspaceRealtimeEvents = {
  byteLength: number
  events: RealtimeEventData[]
  timer: NodeJS.Timeout
  waiters: {
    reject: (error: unknown) => void
    resolve: () => void
  }[]
}

const pendingByWorkspace = new Map<string, PendingWorkspaceRealtimeEvents>()
const inFlightByWorkspace = new Map<string, Promise<void>>()

const appendWorkspaceRealtimeEvents = async (
  workspaceId: string,
  events: RealtimeEventData[],
): Promise<void> => {
  await publishRealtimeStreamRecord({
    events,
    kind: "workspace-events",
    workspaceId,
  })
}

const createPendingWorkspaceRealtimeEvents = (
  workspaceId: string,
): PendingWorkspaceRealtimeEvents => {
  const pending: PendingWorkspaceRealtimeEvents = {
    byteLength: BATCH_ENVELOPE_BYTES,
    events: [],
    timer: setTimeout(
      () =>
        flushPendingWorkspaceRealtimeEvents(workspaceId).catch((error) => {
          logger.error(
            { error, workspaceId },
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

  const previousAppend =
    inFlightByWorkspace.get(workspaceId) ?? Promise.resolve()
  const append = previousAppend.then(() =>
    appendWorkspaceRealtimeEvents(workspaceId, pending.events),
  )
  append.then(
    () => {
      for (const waiter of pending.waiters) {
        waiter.resolve()
      }
    },
    (error) => {
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
  }

/**
 * Coalesces workspace events for a short interval while preserving append order
 * per workspace. Resolves only after the corresponding Redis stream append.
 */
export const publishWorkspaceRealtimeEvent = (
  workspaceId: string,
  event: RealtimeEventData,
): Promise<void> => {
  let pending =
    pendingByWorkspace.get(workspaceId) ??
    createPendingWorkspaceRealtimeEvents(workspaceId)

  const serializedEventBytes = new TextEncoder().encode(
    JSON.stringify(event),
  ).byteLength
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
  pending.byteLength += nextSeparatorBytes + serializedEventBytes
  const delivery = new Promise<void>((resolve, reject) => {
    pending.waiters.push({ reject, resolve })
  })

  if (
    REALTIME_EVENT_TOPICS[event.eventType].topics.includes("voip") ||
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
      { error, eventType: event.eventType, workspaceId },
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
