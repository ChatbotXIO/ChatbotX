import {
  REALTIME_CLOSE_CODE,
  type RealtimeEventRoute,
  type RealtimeMemberClaims,
  type RealtimeStreamRecord,
} from "@chatbotx.io/realtime-protocol"
import type { RealtimeServerCounters } from "./lib/realtime-metrics"

export type WorkspaceSocketData = RealtimeMemberClaims & {
  activated?: boolean
  closeReason?: string
  closed: boolean
  overloadRetryAfterMs?: number
  replayCutoff?: string
  replayEntries: StreamRecordEntry[]
  workspaceId: string
}
export type GuestSocketData = {
  closed: boolean
  guestConversationId: string
  overloadRetryAfterMs?: number
  replayCutoff: string
  replayEntries: StreamRecordEntry[]
  workspaceId: string
}

export type StreamRecordEntry = {
  id: string
  record: RealtimeStreamRecord
}

export type WorkspaceSocket = {
  end: (code?: number, reason?: string) => void
  getUserData: () => WorkspaceSocketData
  send: (data: string) => number
  subscribe: (topic: string) => void
}

type PublishApp = {
  publish: (topic: string, message: string) => boolean
}

type WorkspaceEvent = {
  route?: RealtimeEventRoute
}

const memberKey = (workspaceId: string, userId: string): string =>
  `${workspaceId}:${userId}`

const teamKey = (teamIds: string[]): string => [...teamIds].sort().join(",")

export const encodeBatch = (events: unknown[], seq: string): string =>
  JSON.stringify({ batch: events, seq })

const hasRouteMatch = (
  event: WorkspaceEvent,
  userId: string,
  teamIds: Set<string>,
): boolean => {
  if (!event.route) {
    return false
  }
  if (event.route.assignedUserIds.includes(userId)) {
    return true
  }
  return event.route.assignedTeamIds.some((teamId) => teamIds.has(teamId))
}

const filterWorkspaceEvents = <Event extends WorkspaceEvent>(
  events: Event[],
  {
    chatScope,
    teamIds,
    userId,
  }: Pick<WorkspaceSocketData, "chatScope" | "teamIds" | "userId">,
): Event[] => {
  if (chatScope === "all") {
    return events
  }
  if (chatScope === "none") {
    return []
  }

  const teams = new Set(teamIds)
  return events.filter((event) => hasRouteMatch(event, userId, teams))
}

export type RealtimeDelivery = {
  addWorkspaceSocket: (socket: WorkspaceSocket) => boolean
  dispatch: (entry: StreamRecordEntry) => void
  removeWorkspaceSocket: (socket: WorkspaceSocket) => boolean
  replayGuestSocket: (
    socket: {
      end: (code?: number, reason?: string) => void
      getUserData: () => GuestSocketData
      send: (data: string) => number
    },
    entries?: StreamRecordEntry[],
  ) => void
  replayWorkspaceSocket: (
    socket: WorkspaceSocket,
    entries?: StreamRecordEntry[],
  ) => boolean
  subscribeGuestSocket: (socket: {
    getUserData: () => GuestSocketData
    subscribe: (topic: string) => void
  }) => void
  subscribeWorkspaceSocket: (socket: WorkspaceSocket) => void
}

export const createRealtimeDelivery = (
  app: PublishApp,
  counters: RealtimeServerCounters,
): RealtimeDelivery => {
  const connectionsByMember = new Map<string, Set<WorkspaceSocket>>()
  const restrictedByWorkspace = new Map<string, Set<WorkspaceSocket>>()

  const recordPublish = (topic: string, frame: string): void => {
    app.publish(topic, frame)
    counters.publishes += 1
    counters.publishBytes += frame.length
  }

  const recordSend = (
    socket: {
      end: (code?: number, reason?: string) => void
      getUserData: () => { closed: boolean }
      send: (data: string) => number
    },
    frame: string,
  ): void => {
    const result = socket.send(frame)
    counters.sends += 1
    counters.sendBytes += frame.length
    if (result !== 2) {
      return
    }
    // uWS returned "dropped" (backpressure/connection gone): the client is
    // now missing this event and has no way to detect the gap on its own.
    // Force a resync close so it reconnects and gets a fresh replay instead
    // of silently running with a hole in its event stream.
    counters.drops += 1
    const socketData = socket.getUserData()
    if (socketData.closed) {
      return
    }
    socketData.closed = true
    socket.end(REALTIME_CLOSE_CODE.resync, "backpressure-drop")
  }

  const sendWorkspaceRecord = (
    socket: WorkspaceSocket,
    entry: StreamRecordEntry,
  ): void => {
    if (
      socket.getUserData().closed ||
      entry.record.kind !== "workspace-events"
    ) {
      return
    }
    const events = filterWorkspaceEvents(
      entry.record.events,
      socket.getUserData(),
    )
    if (events.length > 0) {
      recordSend(socket, encodeBatch(events, entry.id))
    }
  }

  const sendMemberRecord = (
    socket: WorkspaceSocket,
    entry: StreamRecordEntry,
  ): void => {
    if (socket.getUserData().closed || entry.record.kind !== "member-send") {
      return
    }
    recordSend(socket, encodeBatch([entry.record.event], entry.id))
  }

  const dispatch = (entry: StreamRecordEntry): void => {
    const { record } = entry
    switch (record.kind) {
      case "workspace-events": {
        recordPublish(
          `ws:${record.workspaceId}:all`,
          encodeBatch(record.events, entry.id),
        )
        const restrictedSockets = restrictedByWorkspace.get(record.workspaceId)
        if (!restrictedSockets) {
          return
        }
        const framesByAudience = new Map<string, string | null>()
        for (const socket of restrictedSockets) {
          if (socket.getUserData().closed) {
            continue
          }
          const { teamIds, userId } = socket.getUserData()
          const audienceKey = `${userId}|${teamKey(teamIds)}`
          const frame = framesByAudience.get(audienceKey)
          if (frame === undefined) {
            const events = filterWorkspaceEvents(
              record.events,
              socket.getUserData(),
            )
            framesByAudience.set(
              audienceKey,
              events.length > 0 ? encodeBatch(events, entry.id) : null,
            )
          }
          const resolvedFrame = framesByAudience.get(audienceKey)
          if (resolvedFrame) {
            recordSend(socket, resolvedFrame)
          }
        }
        return
      }
      case "guest-event":
        recordPublish(
          `guest:${record.workspaceId}:${record.guestConversationId}`,
          encodeBatch([record.event], entry.id),
        )
        return
      case "member-send": {
        const sockets = connectionsByMember.get(
          memberKey(record.workspaceId, record.userId),
        )
        if (!sockets) {
          return
        }
        for (const socket of sockets) {
          sendMemberRecord(socket, entry)
        }
        return
      }
      case "member-revoke": {
        const sockets = connectionsByMember.get(
          memberKey(record.workspaceId, record.userId),
        )
        if (!sockets) {
          return
        }
        for (const socket of sockets) {
          const socketData = socket.getUserData()
          if (socketData.closed) {
            continue
          }
          socketData.closed = true
          socket.end(REALTIME_CLOSE_CODE.revoked, "revoked")
        }
        return
      }
      default:
        return
    }
  }

  return {
    addWorkspaceSocket: (socket) => {
      const { chatScope, userId, workspaceId } = socket.getUserData()
      const key = memberKey(workspaceId, userId)
      const sockets = connectionsByMember.get(key) ?? new Set<WorkspaceSocket>()
      const firstSocket = sockets.size === 0
      sockets.add(socket)
      connectionsByMember.set(key, sockets)
      if (chatScope === "assigned") {
        const restrictedSockets =
          restrictedByWorkspace.get(workspaceId) ?? new Set<WorkspaceSocket>()
        restrictedSockets.add(socket)
        restrictedByWorkspace.set(workspaceId, restrictedSockets)
      }
      return firstSocket
    },
    dispatch,
    removeWorkspaceSocket: (socket) => {
      const { chatScope, userId, workspaceId } = socket.getUserData()
      const key = memberKey(workspaceId, userId)
      const sockets = connectionsByMember.get(key)
      if (!sockets) {
        return false
      }
      sockets.delete(socket)
      if (chatScope === "assigned") {
        const restrictedSockets = restrictedByWorkspace.get(workspaceId)
        restrictedSockets?.delete(socket)
        if (restrictedSockets?.size === 0) {
          restrictedByWorkspace.delete(workspaceId)
        }
      }
      if (sockets.size > 0) {
        return false
      }
      connectionsByMember.delete(key)
      return true
    },
    replayGuestSocket: (
      socket,
      entries = socket.getUserData().replayEntries,
    ) => {
      const { guestConversationId, workspaceId } = socket.getUserData()
      for (const entry of entries) {
        if (
          entry.record.kind === "guest-event" &&
          entry.record.workspaceId === workspaceId &&
          entry.record.guestConversationId === guestConversationId
        ) {
          recordSend(socket, encodeBatch([entry.record.event], entry.id))
        }
      }
    },
    replayWorkspaceSocket: (
      socket,
      entries = socket.getUserData().replayEntries,
    ) => {
      const { workspaceId } = socket.getUserData()
      for (const entry of entries) {
        if (entry.record.workspaceId !== workspaceId) {
          continue
        }
        switch (entry.record.kind) {
          case "workspace-events":
            sendWorkspaceRecord(socket, entry)
            break
          case "member-send":
            if (entry.record.userId === socket.getUserData().userId) {
              sendMemberRecord(socket, entry)
            }
            break
          case "member-revoke":
            if (entry.record.userId === socket.getUserData().userId) {
              socket.getUserData().closed = true
              socket.end(REALTIME_CLOSE_CODE.revoked, "revoked")
              return false
            }
            break
          default:
            break
        }
      }
      return true
    },
    subscribeGuestSocket: (socket) => {
      const { guestConversationId, workspaceId } = socket.getUserData()
      socket.subscribe("hb")
      socket.subscribe(`guest:${workspaceId}:${guestConversationId}`)
    },
    subscribeWorkspaceSocket: (socket) => {
      socket.subscribe("hb")
      if (socket.getUserData().chatScope === "all") {
        socket.subscribe(`ws:${socket.getUserData().workspaceId}:all`)
      }
    },
  }
}
