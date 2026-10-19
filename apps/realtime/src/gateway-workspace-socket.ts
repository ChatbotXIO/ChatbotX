import type { WebSocketBehavior } from "uWebSockets.js"
import {
  getRealtimeMemberRevokedKey,
  REALTIME_CLOSE_CODE,
  type RealtimeMemberClaims,
  verifyMemberConnectToken,
} from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"
import type { RealtimeDelivery, WorkspaceSocketData } from "./delivery"
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

type MemberRevokedCheck = "ok" | "redis-error" | "revoked"

/**
 * Checks the `realtime:revoked:{workspaceId}:{userId}` marker against this
 * token's millisecond-precision mint time. Compares `revokedAt > iatMs`
 * (strict), not `>=` against the floored, whole-second JWT `iat`: flooring
 * can put `iat` before a revoke that landed earlier in the SAME second,
 * rejecting a legitimate reconnect minted within that second.
 */
const checkMemberRevoked = async (
  redis: Redis,
  workspaceId: string,
  claims: RealtimeMemberClaims,
): Promise<MemberRevokedCheck> => {
  let revokedAtRaw: string | null
  try {
    revokedAtRaw = await redis.get(
      getRealtimeMemberRevokedKey(workspaceId, claims.userId),
    )
  } catch (error) {
    logger.warn(
      { err: error, workspaceId },
      "Realtime revoke-marker read failed",
    )
    return "redis-error"
  }
  if (!revokedAtRaw) {
    return "ok"
  }
  const revokedAt = Number(revokedAtRaw)
  if (Number.isNaN(revokedAt)) {
    logger.warn(
      { revokedAtRaw, userId: claims.userId, workspaceId },
      "Realtime revoke marker is not a number",
    )
    return "revoked"
  }
  return revokedAt > claims.iatMs ? "revoked" : "ok"
}

type WorkspaceSocketDeps<GuestSocketData extends object> = {
  addConnectedUser: (workspaceId: string, userId: string) => void
  counters: RealtimeServerCounters
  delivery: RealtimeDelivery
  jitteredConnectionLifetimeMs: () => number
  logTokenRejection: (context: Record<string, unknown>, error: unknown) => void
  maxConnections: number
  maxConnectionsPerWorkspace: number
  redis: Redis
  removeConnectedUser: (workspaceId: string, userId: string) => void
  secret: string
  state: GatewayConnectionState<WorkspaceSocketData, GuestSocketData>
  streamReader: StreamReader
}

export const createWorkspaceSocketBehavior = <GuestSocketData extends object>({
  addConnectedUser,
  counters,
  delivery,
  jitteredConnectionLifetimeMs,
  logTokenRejection,
  maxConnections,
  maxConnectionsPerWorkspace,
  redis,
  removeConnectedUser,
  secret,
  state,
  streamReader,
}: WorkspaceSocketDeps<GuestSocketData>): WebSocketBehavior<WorkspaceSocketData> => ({
  ...baseBehavior,
  upgrade: (res, req, context) => {
    let aborted = false
    res.onAborted(() => {
      aborted = true
    })
    const workspaceId = req.getParameter("workspaceId")
    const token = req.getQuery("token")
    const lastSeq = req.getQuery("lastSeq")
    const requestHeaders = readUpgradeRequest(req)
    if (!(workspaceId && token)) {
      counters.tokenRejections += 1
      writeUnauthorized(res)
      return
    }

    ;(async () => {
      const claims = await verifyConnectToken({
        aborted: () => aborted,
        counters,
        logTokenRejection,
        rejectionContext: { workspaceId },
        res,
        verify: () => verifyMemberConnectToken(token, workspaceId, secret),
      })
      if (!claims) {
        return
      }

      const revokeCheck = await checkMemberRevoked(redis, workspaceId, claims)
      if (revokeCheck !== "ok") {
        if (!aborted) {
          if (revokeCheck === "revoked") {
            counters.tokenRejections += 1
          }
          writeStatus(
            res,
            revokeCheck === "redis-error"
              ? "503 Service Unavailable"
              : "401 Unauthorized",
          )
        }
        return
      }

      const workspaceConnectionCount =
        state.memberConnectionCountByWorkspace.get(workspaceId) ?? 0
      const workspacePendingCount =
        state.memberPendingUpgradesByWorkspace.get(workspaceId) ?? 0
      const overloaded =
        state.activeConnections + state.pendingUpgrades >= maxConnections ||
        workspaceConnectionCount + workspacePendingCount >=
          maxConnectionsPerWorkspace
      if (overloaded) {
        upgradeAsOverloaded({
          aborted,
          context,
          requestHeaders,
          res,
          socketData: {
            ...claims,
            closed: false,
            overloadRetryAfterMs: nextOverloadRetryAfterMs(),
            replayEntries: [],
            workspaceId,
          },
          state,
        })
        return
      }

      const pendingUpgrade = createPendingUpgrade(state, [
        { key: workspaceId, map: state.memberPendingUpgradesByWorkspace },
      ])
      let activated = false
      try {
        const activationLastId =
          await streamReader.activateWorkspace(workspaceId)
        activated = true
        const replay = await loadReplay({ lastSeq, redis, workspaceId })
        if (replay.droppedCount) {
          counters.malformedRecords += replay.droppedCount
        }
        if (aborted) {
          pendingUpgrade.release()
          streamReader.releaseWorkspace(workspaceId)
          return
        }
        const revokeRecheck = await checkMemberRevoked(
          redis,
          workspaceId,
          claims,
        )
        if (revokeRecheck !== "ok") {
          pendingUpgrade.release()
          streamReader.releaseWorkspace(workspaceId)
          if (!aborted) {
            if (revokeRecheck === "revoked") {
              counters.tokenRejections += 1
            }
            writeStatus(
              res,
              revokeRecheck === "redis-error"
                ? "503 Service Unavailable"
                : "401 Unauthorized",
            )
          }
          return
        }
        if (aborted) {
          pendingUpgrade.release()
          streamReader.releaseWorkspace(workspaceId)
          return
        }
        upgradeSocket({
          context,
          headers: requestHeaders,
          res,
          socketData: {
            ...claims,
            activated,
            closeReason:
              replay.closeReason ??
              (replay.droppedCount ? "replay-entries-dropped" : undefined),
            closed: false,
            pendingUpgrade,
            replayCutoff: replay.lastStreamId ?? activationLastId,
            replayEntries: replay.entries,
            workspaceId,
          },
        })
      } catch (error) {
        pendingUpgrade.release()
        if (activated) {
          streamReader.releaseWorkspace(workspaceId)
        }
        if (aborted) {
          return
        }
        logger.error(
          { err: error, workspaceId },
          "Realtime socket replay or upgrade failed",
        )
        writeStatus(res, "503 Service Unavailable")
      }
    })().catch((error) => {
      logger.error(
        { err: error, workspaceId },
        "Unhandled workspace realtime upgrade failure",
      )
    })
  },
  open: (socket) => {
    const socketData = socket.getUserData()
    if (closeIfOverloadedOnOpen({ counters, socket, socketData, state })) {
      return
    }
    counters.upgrades += 1
    acquireSlot([
      {
        key: socketData.workspaceId,
        map: state.memberConnectionCountByWorkspace,
      },
    ])
    const firstUserSocket = delivery.addWorkspaceSocket(socket)
    delivery.subscribeWorkspaceSocket(socket)
    if (socketData.closeReason) {
      socketData.closed = true
      socket.end(REALTIME_CLOSE_CODE.resync, socketData.closeReason)
      return
    }
    if (!delivery.replayWorkspaceSocket(socket)) {
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
    if (!delivery.replayWorkspaceSocket(socket, gapEntries)) {
      return
    }
    if (closeIfTainted({ socket, socketData, streamReader })) {
      return
    }
    if (socketData.replayCutoff) {
      delivery.sendCursor(socket, socketData.replayCutoff)
    }
    if (socketData.closed) {
      return
    }
    socketData.replayEntries = []
    socketData.replayCutoff = undefined
    if (firstUserSocket) {
      addConnectedUser(socketData.workspaceId, socketData.userId)
    }
    armLifetimeTimer(
      state.workspaceLifetimeTimers,
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
    releaseSlot([
      {
        key: socketData.workspaceId,
        map: state.memberConnectionCountByWorkspace,
      },
    ])
    clearLifetimeTimer(state.workspaceLifetimeTimers, socketData)
    if (socketData.activated) {
      streamReader.releaseWorkspace(socketData.workspaceId)
    }
    if (delivery.removeWorkspaceSocket(socket)) {
      removeConnectedUser(socketData.workspaceId, socketData.userId)
    }
  },
})
