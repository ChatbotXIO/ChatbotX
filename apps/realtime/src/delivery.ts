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

/** Minimal closable reference kept per-workspace so a server-detected gap
 * (e.g. a malformed stream record) can force every affected guest socket to
 * resync, not just the member sockets `WorkspaceSocket` already covers. */
export type GuestSocket = {
  end: (code?: number, reason?: string) => void
  getUserData: () => GuestSocketData
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

/**
 * `"deleted"` closes are terminal (the client must not reconnect); `"reauth"`
 * closes are a forced re-handshake only — the client reconnects with a
 * freshly minted token and keeps its replay cursor. See PR #1349 finding #1.
 */
const closeCodeForRevoke = (
  reason: "deleted" | "reauth",
): { closeCode: number; closeReason: string } =>
  reason === "deleted"
    ? { closeCode: REALTIME_CLOSE_CODE.revoked, closeReason: "revoked" }
    : { closeCode: REALTIME_CLOSE_CODE.reauth, closeReason: "reauth" }

const encodeBatch = (events: unknown[], seq: string): string =>
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
  addGuestSocket: (socket: GuestSocket) => void
  addWorkspaceSocket: (socket: WorkspaceSocket) => boolean
  dispatch: (entry: StreamRecordEntry) => void
  removeGuestSocket: (socket: GuestSocket) => void
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
  /** Forces every known socket (member and guest) of one workspace to
   * resync — used when a stream record for that workspace couldn't be fully
   * parsed, so every local recipient has a confirmed gap. */
  resyncWorkspace: (workspaceId: string, reason: string) => void
  /** Sends an empty-batch frame carrying only `seq` — lets a socket's
   * open-time replay cursor reach the client even when nothing was
   * replayed, so a reconnect that processes zero live batches still has a
   * real cursor instead of falling back to a synthetic one on its next
   * reconnect. See PR #1349 finding #2. */
  sendCursor: (socket: WorkspaceSocket, seq: string) => void
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
  const memberSocketsByWorkspace = new Map<string, Set<WorkspaceSocket>>()
  const guestSocketsByWorkspace = new Map<string, Set<GuestSocket>>()

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
        const { closeCode, closeReason } = closeCodeForRevoke(record.reason)
        for (const socket of sockets) {
          const socketData = socket.getUserData()
          if (socketData.closed) {
            continue
          }
          socketData.closed = true
          socket.end(closeCode, closeReason)
        }
        return
      }
      default:
        return
    }
  }

  return {
    addGuestSocket: (socket) => {
      const { workspaceId } = socket.getUserData()
      const sockets =
        guestSocketsByWorkspace.get(workspaceId) ?? new Set<GuestSocket>()
      sockets.add(socket)
      guestSocketsByWorkspace.set(workspaceId, sockets)
    },
    addWorkspaceSocket: (socket) => {
      const { chatScope, userId, workspaceId } = socket.getUserData()
      const key = memberKey(workspaceId, userId)
      const sockets = connectionsByMember.get(key) ?? new Set<WorkspaceSocket>()
      const firstSocket = sockets.size === 0
      sockets.add(socket)
      connectionsByMember.set(key, sockets)
      const workspaceSockets =
        memberSocketsByWorkspace.get(workspaceId) ?? new Set<WorkspaceSocket>()
      workspaceSockets.add(socket)
      memberSocketsByWorkspace.set(workspaceId, workspaceSockets)
      if (chatScope === "assigned") {
        const restrictedSockets =
          restrictedByWorkspace.get(workspaceId) ?? new Set<WorkspaceSocket>()
        restrictedSockets.add(socket)
        restrictedByWorkspace.set(workspaceId, restrictedSockets)
      }
      return firstSocket
    },
    dispatch,
    removeGuestSocket: (socket) => {
      const { workspaceId } = socket.getUserData()
      const sockets = guestSocketsByWorkspace.get(workspaceId)
      if (!sockets) {
        return
      }
      sockets.delete(socket)
      if (sockets.size === 0) {
        guestSocketsByWorkspace.delete(workspaceId)
      }
    },
    removeWorkspaceSocket: (socket) => {
      const { chatScope, userId, workspaceId } = socket.getUserData()
      const key = memberKey(workspaceId, userId)
      const sockets = connectionsByMember.get(key)
      const workspaceSockets = memberSocketsByWorkspace.get(workspaceId)
      workspaceSockets?.delete(socket)
      if (workspaceSockets?.size === 0) {
        memberSocketsByWorkspace.delete(workspaceId)
      }
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
          // "member-revoke" entries are never replayed: the gateway's
          // connect-time check (`getRealtimeMemberRevokedKey` against the
          // token's `iat`) already rejected the connect if this user was
          // revoked after the token was minted — independent of whether
          // this socket's `lastSeq` even covers the window the revoke
          // entry sits in. A live revoke while already connected is still
          // handled, in `dispatch` below. See PR #1349 round-4 finding #5.
          default:
            break
        }
      }
      return true
    },
    resyncWorkspace: (workspaceId, reason) => {
      for (const socket of memberSocketsByWorkspace.get(workspaceId) ?? []) {
        const socketData = socket.getUserData()
        if (socketData.closed) {
          continue
        }
        socketData.closed = true
        socket.end(REALTIME_CLOSE_CODE.resync, reason)
      }
      for (const socket of guestSocketsByWorkspace.get(workspaceId) ?? []) {
        const socketData = socket.getUserData()
        if (socketData.closed) {
          continue
        }
        socketData.closed = true
        socket.end(REALTIME_CLOSE_CODE.resync, reason)
      }
    },
    sendCursor: (socket, seq) => {
      if (socket.getUserData().closed) {
        return
      }
      recordSend(socket, encodeBatch([], seq))
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
