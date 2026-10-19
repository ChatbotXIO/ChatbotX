import type { WebSocketBehavior } from "uWebSockets.js"
import {
  REALTIME_CLOSE_CODE,
  verifyGuestConnectToken,
} from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"
import type { GuestSocketData, RealtimeDelivery } from "./delivery"
import {
  acquireSlot,
  armLifetimeTimer,
  baseBehavior,
  clearLifetimeTimer,
  closeIfOverloadedOnOpen,
  closeIfTainted,
  createPendingUpgrade,
  type GatewayConnectionState,
  nextOverloadRetryAfterMs,
  readUpgradeRequest,
  releaseSlot,
  upgradeAsOverloaded,
  upgradeSocket,
  verifyConnectToken,
  writeStatus,
  writeUnauthorized,
} from "./gateway-shared"
import type { RealtimeServerCounters } from "./lib/realtime-metrics"
import { logger } from "./logger"
import { loadReplay } from "./replay"
import type { StreamReader } from "./stream-reader"

const guestConnectionKey = (
  workspaceId: string,
  guestConversationId: string,
): string => `${workspaceId}:${guestConversationId}`

type GuestSocketDeps<WorkspaceSocketData extends object> = {
  counters: RealtimeServerCounters
  delivery: RealtimeDelivery
  jitteredConnectionLifetimeMs: () => number
  logTokenRejection: (context: Record<string, unknown>, error: unknown) => void
  maxConnections: number
  maxConnectionsPerGuest: number
  maxGuestConnections: number
  maxGuestConnectionsPerWorkspace: number
  redis: Redis
  secret: string
  state: GatewayConnectionState<WorkspaceSocketData, GuestSocketData>
  streamReader: StreamReader
}

export const createGuestSocketBehavior = <WorkspaceSocketData extends object>({
  counters,
  delivery,
  jitteredConnectionLifetimeMs,
  logTokenRejection,
  maxConnections,
  maxConnectionsPerGuest,
  maxGuestConnections,
  maxGuestConnectionsPerWorkspace,
  redis,
  secret,
  state,
  streamReader,
}: GuestSocketDeps<WorkspaceSocketData>): WebSocketBehavior<GuestSocketData> => ({
  ...baseBehavior,
  upgrade: (res, req, context) => {
    let aborted = false
    res.onAborted(() => {
      aborted = true
    })
    const guestConversationId = req.getParameter("guestConversationId")
    const token = req.getQuery("token")
    const lastSeq = req.getQuery("lastSeq")
    const requestHeaders = readUpgradeRequest(req)
    if (!(guestConversationId && token)) {
      counters.tokenRejections += 1
      writeUnauthorized(res)
      return
    }

    ;(async () => {
      const claims = await verifyConnectToken({
        aborted: () => aborted,
        counters,
        logTokenRejection,
        rejectionContext: { guestConversationId },
        res,
        verify: () =>
          verifyGuestConnectToken(token, guestConversationId, secret),
      })
      if (!claims) {
        return
      }

      const guestKey = guestConnectionKey(
        claims.workspaceId,
        guestConversationId,
      )
      const guestConnectionCount =
        state.guestConnectionCountByKey.get(guestKey) ?? 0
      const guestPendingCount =
        state.guestPendingUpgradesByKey.get(guestKey) ?? 0
      const workspaceGuestConnectionCount =
        state.guestConnectionCountByWorkspace.get(claims.workspaceId) ?? 0
      const workspaceGuestPendingCount =
        state.guestPendingUpgradesByWorkspace.get(claims.workspaceId) ?? 0
      const overloaded =
        state.activeConnections + state.pendingUpgrades >= maxConnections ||
        state.activeGuestConnections + state.pendingGuestUpgrades >=
          maxGuestConnections ||
        guestConnectionCount + guestPendingCount >= maxConnectionsPerGuest ||
        workspaceGuestConnectionCount + workspaceGuestPendingCount >=
          maxGuestConnectionsPerWorkspace
      if (overloaded) {
        upgradeAsOverloaded({
          aborted,
          context,
          isGuest: true,
          requestHeaders,
          res,
          socketData: {
            ...claims,
            closed: false,
            overloadRetryAfterMs: nextOverloadRetryAfterMs(),
            replayCutoff: "0-0",
            replayEntries: [],
          },
          state,
        })
        return
      }

      const pendingUpgrade = createPendingUpgrade(
        state,
        [
          { key: guestKey, map: state.guestPendingUpgradesByKey },
          {
            key: claims.workspaceId,
            map: state.guestPendingUpgradesByWorkspace,
          },
        ],
        true,
      )
      let activated = false
      try {
        const activationLastId = await streamReader.activateWorkspace(
          claims.workspaceId,
        )
        activated = true
        const replay = await loadReplay({
          lastSeq,
          redis,
          workspaceId: claims.workspaceId,
        })
        if (replay.droppedCount) {
          counters.malformedRecords += replay.droppedCount
        }
        if (aborted) {
          pendingUpgrade.release()
          streamReader.releaseWorkspace(claims.workspaceId)
          return
        }
        upgradeSocket({
          context,
          headers: requestHeaders,
          res,
          socketData: {
            ...claims,
            closeReason:
              replay.closeReason ??
              (replay.droppedCount ? "replay-entries-dropped" : undefined),
            closed: false,
            pendingUpgrade,
            replayCutoff: replay.lastStreamId ?? activationLastId,
            replayEntries: replay.entries,
          },
        })
      } catch (error) {
        pendingUpgrade.release()
        if (activated) {
          streamReader.releaseWorkspace(claims.workspaceId)
        }
        if (aborted) {
          return
        }
        logger.error(
          { err: error, guestConversationId },
          "Realtime guest socket activation or upgrade failed",
        )
        writeStatus(res, "503 Service Unavailable")
      }
    })().catch((error) => {
      logger.error(
        { err: error, guestConversationId },
        "Unhandled guest realtime upgrade failure",
      )
    })
  },
  open: (socket) => {
    const socketData = socket.getUserData()
    if (
      closeIfOverloadedOnOpen({
        counters,
        onAccepted: () => {
          state.activeGuestConnections += 1
        },
        socket,
        socketData,
        state,
      })
    ) {
      return
    }
    counters.upgrades += 1
    const guestKey = guestConnectionKey(
      socketData.workspaceId,
      socketData.guestConversationId,
    )
    acquireSlot([
      { key: guestKey, map: state.guestConnectionCountByKey },
      {
        key: socketData.workspaceId,
        map: state.guestConnectionCountByWorkspace,
      },
    ])
    delivery.addGuestSocket(socket)
    delivery.subscribeGuestSocket(socket)
    if (socketData.closeReason) {
      socketData.closed = true
      socket.end(REALTIME_CLOSE_CODE.resync, socketData.closeReason)
      return
    }
    if (!delivery.replayGuestSocket(socket)) {
      return
    }
    if (
      streamReader.hasRecentEntriesGap(
        socketData.workspaceId,
        socketData.replayCutoff,
      )
    ) {
      socketData.closed = true
      socket.end(REALTIME_CLOSE_CODE.resync, "recent-entries-expired")
      return
    }
    const gapEntries = streamReader.getRecentEntries(
      socketData.workspaceId,
      socketData.replayCutoff,
    )
    if (!delivery.replayGuestSocket(socket, gapEntries)) {
      return
    }
    if (closeIfTainted({ socket, socketData, streamReader })) {
      return
    }
    socketData.replayEntries = []
    armLifetimeTimer(
      state.guestLifetimeTimers,
      socketData,
      socket,
      jitteredConnectionLifetimeMs(),
    )
  },
  close: (socket) => {
    const socketData = socket.getUserData()
    socketData.closed = true
    socketData.pendingUpgrade?.release()
    if (socketData.overloadRetryAfterMs !== undefined) {
      return
    }
    state.activeConnections -= 1
    state.activeGuestConnections -= 1
    releaseSlot([
      {
        key: guestConnectionKey(
          socketData.workspaceId,
          socketData.guestConversationId,
        ),
        map: state.guestConnectionCountByKey,
      },
      {
        key: socketData.workspaceId,
        map: state.guestConnectionCountByWorkspace,
      },
    ])
    clearLifetimeTimer(state.guestLifetimeTimers, socketData)
    delivery.removeGuestSocket(socket)
    streamReader.releaseWorkspace(socketData.workspaceId)
  },
})
