import type {
  BroadcastTarget,
  RealtimeEventData,
} from "@chatbotx.io/partysocket-config"
import {
  broadcastToGuestParty as broadcastToGuestPartyLow,
  broadcastToWorkspaceParty as broadcastToWorkspacePartyLow,
  REALTIME_DELIVERY_NEGATIVE_TTL_MS,
  REALTIME_EVENT_TOPICS,
  RealtimeEventType,
  revokeWorkspaceMemberConnections as revokeWorkspaceMemberConnectionsLow,
  sendToWorkspaceMember as sendToWorkspaceMemberLow,
} from "@chatbotx.io/partysocket-config"
import { logger } from "../logger"
import {
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveRealtimeDeliveryGate,
} from "./settings"

export const WORKSPACE_BROADCAST_COALESCE_MS = 25
export const WORKSPACE_BROADCAST_MAX_EVENTS = 64
export const WORKSPACE_BROADCAST_MAX_BYTES = 256 * 1024

const BATCH_ENVELOPE_BYTES = new TextEncoder().encode('{"batch":[]}').byteLength

type PendingWorkspaceBroadcast = {
  byteLength: number
  events: RealtimeEventData[]
  timer: NodeJS.Timeout
  waiters: {
    resolve: (interested: number | null) => void
  }[]
}

const pendingByWorkspace = new Map<string, PendingWorkspaceBroadcast>()
const inFlightByWorkspace = new Map<string, Promise<void>>()
const chatNegativeCache = new Map<string, number>()

let cachedTarget: BroadcastTarget | undefined

export const resolveRealtimeBroadcastTarget = (): BroadcastTarget =>
  (cachedTarget ??= {
    secret: resolveBroadcastSecret(),
    url: resolveRealtimeBroadcastUrl(),
  })

/**
 * Ephemeral chat events may be skipped only when their topic metadata marks
 * them as such.
 */
const isGateableEvent = (event: RealtimeEventData): boolean => {
  if (event.eventType !== "typing") {
    return false
  }

  const eventTopics = REALTIME_EVENT_TOPICS[event.eventType]
  return (
    event.eventType === RealtimeEventType.typing &&
    eventTopics.durability === "ephemeral" &&
    eventTopics.topics.length === 1 &&
    eventTopics.topics[0] === "chat"
  )
}

const isChatDeliverySuppressed = (
  workspaceId: string,
  event: RealtimeEventData,
): boolean => {
  if (!(resolveRealtimeDeliveryGate() && isGateableEvent(event))) {
    return false
  }

  const expiresAt = chatNegativeCache.get(workspaceId)
  if (expiresAt === undefined) {
    return false
  }
  if (expiresAt <= Date.now()) {
    chatNegativeCache.delete(workspaceId)
    return false
  }
  return true
}

const recordRelayInterest = (
  workspaceId: string,
  events: readonly RealtimeEventData[],
  interested: number | null,
): void => {
  if (
    !resolveRealtimeDeliveryGate() ||
    interested === null ||
    events.length === 0 ||
    !events.every(isGateableEvent)
  ) {
    return
  }
  if (interested > 0) {
    chatNegativeCache.delete(workspaceId)
    return
  }
  chatNegativeCache.set(
    workspaceId,
    Date.now() + REALTIME_DELIVERY_NEGATIVE_TTL_MS,
  )
}

const sendWorkspaceEvents = async (
  workspaceId: string,
  events: RealtimeEventData | readonly RealtimeEventData[],
): Promise<number | null> => {
  const eventList = Array.isArray(events) ? events : [events]
  try {
    const interested = await broadcastToWorkspacePartyLow(
      resolveRealtimeBroadcastTarget(),
      workspaceId,
      events,
    )
    recordRelayInterest(workspaceId, eventList, interested)
    return interested
  } catch (err) {
    logger.error(
      {
        err,
        eventCount: eventList.length,
        eventTypes: eventList.map((event) => event.eventType),
        workspaceId,
      },
      "Failed to broadcast realtime events",
    )
    return null
  }
}

const createPendingWorkspaceBroadcast = (
  workspaceId: string,
): PendingWorkspaceBroadcast => {
  const pending: PendingWorkspaceBroadcast = {
    byteLength: BATCH_ENVELOPE_BYTES,
    events: [],
    timer: setTimeout(() => {
      flushPendingWorkspaceBroadcasts(workspaceId)
    }, WORKSPACE_BROADCAST_COALESCE_MS),
    waiters: [],
  }
  pendingByWorkspace.set(workspaceId, pending)
  return pending
}

/**
 * Flushes the coalesced tail for one workspace. Exported as a deterministic
 * seam for callers that need to drain before shutdown and for focused tests.
 */
export function flushPendingWorkspaceBroadcasts(
  workspaceId: string,
): Promise<number | null> {
  const pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    return Promise.resolve(null)
  }

  pendingByWorkspace.delete(workspaceId)
  clearTimeout(pending.timer)
  if (pending.events.length === 0) {
    return Promise.resolve(null)
  }

  const previousSend = inFlightByWorkspace.get(workspaceId) ?? Promise.resolve()
  const flush = previousSend
    .then(() => sendWorkspaceEvents(workspaceId, pending.events))
    .then(
      (interested) => {
        for (const waiter of pending.waiters) {
          waiter.resolve(interested)
        }
        return interested
      },
      () => {
        for (const waiter of pending.waiters) {
          waiter.resolve(null)
        }
        return null
      },
    )
  const completion = flush.then(() => undefined)
  inFlightByWorkspace.set(workspaceId, completion)
  completion.then(() => {
    if (inFlightByWorkspace.get(workspaceId) === completion) {
      inFlightByWorkspace.delete(workspaceId)
    }
  })
  return flush
}

export const resetRealtimeBroadcastStateForTests = (): void => {
  for (const pending of pendingByWorkspace.values()) {
    clearTimeout(pending.timer)
    for (const waiter of pending.waiters) {
      waiter.resolve(null)
    }
  }
  pendingByWorkspace.clear()
  inFlightByWorkspace.clear()
  chatNegativeCache.clear()
}

export const flushAllPendingWorkspaceBroadcasts = async (): Promise<void> => {
  const pendingWorkspaceIds = [...pendingByWorkspace.keys()]
  await Promise.all(
    pendingWorkspaceIds.map((workspaceId) =>
      flushPendingWorkspaceBroadcasts(workspaceId),
    ),
  )
  await Promise.all(inFlightByWorkspace.values())
}

export const broadcastToWorkspaceParty = (
  workspaceId: string,
  event: RealtimeEventData,
): Promise<number | null> => {
  if (isChatDeliverySuppressed(workspaceId, event)) {
    return Promise.resolve(0)
  }

  let pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    pending = createPendingWorkspaceBroadcast(workspaceId)
  }

  const serializedEventBytes = new TextEncoder().encode(
    JSON.stringify(event),
  ).byteLength
  const separatorBytes = pending.events.length > 0 ? 1 : 0
  const wouldExceedBytes =
    pending.byteLength + separatorBytes + serializedEventBytes >
    WORKSPACE_BROADCAST_MAX_BYTES
  const wouldExceedCount =
    pending.events.length + 1 > WORKSPACE_BROADCAST_MAX_EVENTS

  if (wouldExceedBytes || wouldExceedCount) {
    flushPendingWorkspaceBroadcasts(workspaceId)
    pending = createPendingWorkspaceBroadcast(workspaceId)
  }

  const nextSeparatorBytes = pending.events.length > 0 ? 1 : 0
  pending.events.push(event)
  pending.byteLength += nextSeparatorBytes + serializedEventBytes
  const result = new Promise<number | null>((resolve) => {
    pending.waiters.push({ resolve })
  })

  if (
    REALTIME_EVENT_TOPICS[event.eventType].topics.includes("voip") ||
    pending.events.length === WORKSPACE_BROADCAST_MAX_EVENTS
  ) {
    flushPendingWorkspaceBroadcasts(workspaceId)
  }
  return result
}

export const publishToWorkspaceParty = (
  workspaceId: string,
  event: RealtimeEventData,
): void => {
  const delivery = broadcastToWorkspaceParty(workspaceId, event)
  delivery.catch((err) => {
    logger.error(
      { err, eventType: event.eventType, workspaceId },
      "Failed to publish realtime event",
    )
  })
}

/**
 * Delivers an event to only one workspace member's currently-open realtime
 * connections (never a workspace-wide broadcast) — e.g. the VoIP offer for
 * the single agent a call was routed to.
 */
export const sendToWorkspaceMember = (
  args: { workspaceId: string; userId: string },
  json: RealtimeEventData,
) => {
  const target = resolveRealtimeBroadcastTarget()
  return sendToWorkspaceMemberLow(target, args.workspaceId, args.userId, json)
}

/**
 * Closes a member's tagged realtime connections in a workspace room — used
 * on membership removal so a former member's already-open socket stops
 * receiving further events immediately, rather than only on next reconnect.
 */
export const revokeWorkspaceMemberConnections = (args: {
  workspaceId: string
  userId: string
}) => {
  const target = resolveRealtimeBroadcastTarget()
  return revokeWorkspaceMemberConnectionsLow(
    target,
    args.workspaceId,
    args.userId,
  )
}

export const broadcastToGuestParty = (
  args: { workspaceId: string; guestConversationId: string },
  json: RealtimeEventData,
) => {
  const target = resolveRealtimeBroadcastTarget()
  return broadcastToGuestPartyLow(target, args.guestConversationId, json)
}
