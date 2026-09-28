import type {
  RealtimeMemberClaims,
  RealtimeStreamRecord,
} from "@chatbotx.io/realtime-protocol"

export const REALTIME_CLOSE_CODE = { resync: 4002, revoked: 4001 } as const

export type WorkspaceSocketData = RealtimeMemberClaims & {
  closeReason?: string
  closed: boolean
  replayCutoff?: string
  replayEntries: StreamRecordEntry[]
  workspaceId: string
}
export type GuestSocketData = {
  closed: boolean
  guestConversationId: string
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
  send: (data: string) => void
  subscribe: (topic: string) => void
}

type PublishApp = {
  publish: (topic: string, message: string) => boolean
}

type WorkspaceEvent = {
  route?: {
    assignedTeamIds: string[]
    assignedUserIds: string[]
  }
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
      getUserData: () => GuestSocketData
      send: (data: string) => void
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

export const createRealtimeDelivery = (app: PublishApp): RealtimeDelivery => {
  const connectionsByMember = new Map<string, Set<WorkspaceSocket>>()
  const restrictedByWorkspace = new Map<string, Set<WorkspaceSocket>>()

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
      socket.send(encodeBatch(events, entry.id))
    }
  }

  const sendMemberRecord = (
    socket: WorkspaceSocket,
    entry: StreamRecordEntry,
  ): void => {
    if (socket.getUserData().closed || entry.record.kind !== "member-send") {
      return
    }
    socket.send(encodeBatch([entry.record.event], entry.id))
  }

  const dispatch = (entry: StreamRecordEntry): void => {
    const { record } = entry
    switch (record.kind) {
      case "workspace-events": {
        app.publish(
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
            socket.send(resolvedFrame)
          }
        }
        return
      }
      case "guest-event":
        app.publish(
          `guest:${record.guestConversationId}`,
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
          socket.send(encodeBatch([entry.record.event], entry.id))
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
      socket.subscribe("hb")
      socket.subscribe(`guest:${socket.getUserData().guestConversationId}`)
    },
    subscribeWorkspaceSocket: (socket) => {
      socket.subscribe("hb")
      if (socket.getUserData().chatScope === "all") {
        socket.subscribe(`ws:${socket.getUserData().workspaceId}:all`)
      }
    },
  }
}
