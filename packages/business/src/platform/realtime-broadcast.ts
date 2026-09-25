import {
  type BroadcastTarget,
  broadcastToGuestParty as broadcastToGuestPartyLow,
  broadcastToWorkspaceParty as broadcastToWorkspacePartyLow,
  REALTIME_DELIVERY_NEGATIVE_TTL_MS,
  REALTIME_EVENT_TOPICS,
  type RealtimeEventData,
  RealtimeEventType,
  RealtimeTopic,
  revokeWorkspaceMemberConnections as revokeWorkspaceMemberConnectionsLow,
  sendToWorkspaceMember as sendToWorkspaceMemberLow,
} from "@chatbotx.io/partysocket-config"
import { logger } from "../logger"
import {
  resolveBroadcastSecret,
  resolveRealtimeBroadcastUrl,
  resolveRealtimeDeliveryGate,
} from "./settings"

export const WORKSPACE_BROADCAST_COALESCE_MS = 10
export const WORKSPACE_BROADCAST_MAX_EVENTS = 64
export const WORKSPACE_BROADCAST_MAX_BYTES = 256 * 1024

const BATCH_ENVELOPE_BYTES = new TextEncoder().encode('{"batch":[]}').byteLength

type PendingWorkspaceBroadcast = {
  byteLength: number
  events: RealtimeEventData[]
  timer: ReturnType<typeof setTimeout>
  waiters: {
    resolve: (interested: number | null) => void
  }[]
}

const pendingByWorkspace = new Map<string, PendingWorkspaceBroadcast>()
const chatNegativeCache = new Map<string, number>()

let cachedTarget: BroadcastTarget | undefined

export const resolveRealtimeBroadcastTarget = (): BroadcastTarget =>
  (cachedTarget ??= {
    secret: resolveBroadcastSecret(),
    url: resolveRealtimeBroadcastUrl(),
  })

/**
 * Only disposable events may be skipped. Durable chat events must always reach
 * the relay because there is no subscriber catch-up path after a dropped
 * delivery. Keep the sole-topic check so mixed chat+voip events always reach
 * their voip subscribers.
 */
const GATEABLE_EVENT_TYPES: Partial<
  Record<RealtimeEventData["eventType"], true>
> = {
  [RealtimeEventType.typing]: true,
}

const isGateableEvent = (event: RealtimeEventData): boolean => {
  const topics = REALTIME_EVENT_TOPICS[event.eventType]
  return (
    GATEABLE_EVENT_TYPES[event.eventType] === true &&
    topics.length === 1 &&
    topics[0] === RealtimeTopic.chat
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
export async function flushPendingWorkspaceBroadcasts(
  workspaceId: string,
): Promise<number | null> {
  const pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    return null
  }

  pendingByWorkspace.delete(workspaceId)
  clearTimeout(pending.timer)
  if (pending.events.length === 0) {
    return null
  }

  const interested = await sendWorkspaceEvents(workspaceId, pending.events)
  for (const waiter of pending.waiters) {
    waiter.resolve(interested)
  }
  return interested
}

export const resetRealtimeBroadcastStateForTests = (): void => {
  for (const pending of pendingByWorkspace.values()) {
    clearTimeout(pending.timer)
    for (const waiter of pending.waiters) {
      waiter.resolve(null)
    }
  }
  pendingByWorkspace.clear()
  chatNegativeCache.clear()
}

export const broadcastToWorkspaceParty = (
  workspaceId: string,
  event: RealtimeEventData,
): Promise<number | null> => {
  if (isChatDeliverySuppressed(workspaceId, event)) {
    return Promise.resolve(0)
  }

  const pending = pendingByWorkspace.get(workspaceId)
  if (!pending) {
    createPendingWorkspaceBroadcast(workspaceId)
    return sendWorkspaceEvents(workspaceId, event)
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
    createPendingWorkspaceBroadcast(workspaceId)
    return sendWorkspaceEvents(workspaceId, event)
  }

  pending.events.push(event)
  pending.byteLength += separatorBytes + serializedEventBytes
  const result = new Promise<number | null>((resolve) => {
    pending.waiters.push({ resolve })
  })

  if (pending.events.length === WORKSPACE_BROADCAST_MAX_EVENTS) {
    flushPendingWorkspaceBroadcasts(workspaceId)
  }
  return result
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
