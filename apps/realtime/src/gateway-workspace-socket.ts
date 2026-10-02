import type { WebSocketBehavior } from "uWebSockets.js"
import {
  getRealtimeMemberRevokedKey,
  isRealtimeSeqAfter,
  REALTIME_CLOSE_CODE,
  type RealtimeMemberClaims,
  verifyMemberConnectToken,
} from "@chatbotx.io/realtime-protocol"
import type { Redis } from "@chatbotx.io/redis"
import type { RealtimeDelivery, WorkspaceSocketData } from "./delivery"
import {
  acquireSlot,
  armLifetimeTimer,
  type GatewayConnectionState,
  nextOverloadRetryAfterMs,
  readUpgradeRequest,
  releaseSlot,
} from "./gateway-shared"
import type { RealtimeServerCounters } from "./lib/realtime-metrics"
import { logger } from "./logger"
import { loadReplay } from "./replay"
import type { StreamReader } from "./stream-reader"

const SLOW_CONSUMER_BUFFER_BYTES = 512_000

type MemberRevokedCheck = "ok" | "redis-error" | "revoked"

/**
 * Checks the `realtime:revoked:{workspaceId}:{userId}` marker against this
 * token's millisecond-precision mint time. Compares `revokedAt > iatMs`
 * (strict), not `>=` against the floored, whole-second JWT `iat`: flooring
 * can put `iat` before a revoke that landed earlier in the SAME second,
 * rejecting a legitimate reconnect minted within that second. See PR #1349
 * round-5 finding #2.
 *
 * Fails closed on an unreadable marker: a Redis error returns
 * `"redis-error"` (the caller answers 503, not a silent admit) rather than
 * letting `await redis.get` hang the upgrade with no response at all. A
 * marker value that isn't a number (corruption) is treated as `"revoked"`,
 * not silently admitted via a NaN comparison that's always `false` either
 * way. See PR #1349 round-5 finding #3.
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

export type WorkspaceSocketDeps<GuestSocketData extends object> = {
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
  closeOnBackpressureLimit: true,
  idleTimeout: 60,
  maxBackpressure: SLOW_CONSUMER_BUFFER_BYTES,
  sendPingsAutomatically: true,
  upgrade: (res, req, context) => {
    let aborted = false
    res.onAborted(() => {
      aborted = true
    })
    const workspaceId = req.getParameter("workspaceId")
    const token = req.getQuery("token")
    const lastSeq = req.getQuery("lastSeq")
    const { websocketExtensions, websocketKey, websocketProtocol } =
      readUpgradeRequest(req)
    if (!(workspaceId && token)) {
      counters.tokenRejections += 1
      res.cork(() => {
        res.writeStatus("401 Unauthorized").end()
      })
      return
    }

    ;(async () => {
      let claims: RealtimeMemberClaims
      try {
        claims = await verifyMemberConnectToken(token, workspaceId, secret)
      } catch (error) {
        if (!aborted) {
          counters.tokenRejections += 1
          logTokenRejection({ workspaceId }, error)
          res.cork(() => {
            res.writeStatus("401 Unauthorized").end()
          })
        }
        return
      }

      // Independent of whether this connect carries a `lastSeq`: a
      // stream-entry-based revoke check only catches a revoke sitting
      // *inside* the replayed window, so a connect with no `lastSeq` at
      // all (e.g. every connect after a 4002 resync) used to skip the
      // check entirely, letting a pre-revoke token that's still
      // unexpired (the token TTL plus clock tolerance) connect. See
      // PR #1349 round-4 finding #5.
      const revokeCheck = await checkMemberRevoked(redis, workspaceId, claims)
      if (revokeCheck !== "ok") {
        if (!aborted) {
          if (revokeCheck === "revoked") {
            counters.tokenRejections += 1
          }
          res.cork(() => {
            res
              .writeStatus(
                revokeCheck === "redis-error"
                  ? "503 Service Unavailable"
                  : "401 Unauthorized",
              )
              .end()
          })
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
        if (aborted) {
          return
        }
        res.cork(() => {
          res.upgrade(
            {
              ...claims,
              closed: false,
              overloadRetryAfterMs: nextOverloadRetryAfterMs(),
              replayEntries: [],
              workspaceId,
            },
            websocketKey,
            websocketProtocol,
            websocketExtensions,
            context,
          )
        })
        state.pendingUpgrades += 1
        return
      }
      state.pendingUpgrades += 1
      acquireSlot([
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
          state.pendingUpgrades -= 1
          releaseSlot([
            { key: workspaceId, map: state.memberPendingUpgradesByWorkspace },
          ])
          streamReader.releaseWorkspace(workspaceId)
          return
        }
        // Re-checked here, not just once above: a revoke landing in the
        // window between the first check and `activateWorkspace` /
        // `loadReplay` completing would otherwise let a revoked member
        // connect anyway for up to the full connection lifetime. See
        // PR #1349 round-5 finding #4.
        const revokeRecheck = await checkMemberRevoked(
          redis,
          workspaceId,
          claims,
        )
        if (revokeRecheck !== "ok") {
          state.pendingUpgrades -= 1
          releaseSlot([
            { key: workspaceId, map: state.memberPendingUpgradesByWorkspace },
          ])
          streamReader.releaseWorkspace(workspaceId)
          if (!aborted) {
            if (revokeRecheck === "revoked") {
              counters.tokenRejections += 1
            }
            res.cork(() => {
              res
                .writeStatus(
                  revokeRecheck === "redis-error"
                    ? "503 Service Unavailable"
                    : "401 Unauthorized",
                )
                .end()
            })
          }
          return
        }
        res.cork(() => {
          res.upgrade(
            {
              ...claims,
              activated,
              closeReason:
                replay.closeReason ??
                (replay.droppedCount ? "replay-entries-dropped" : undefined),
              closed: false,
              replayCutoff: replay.lastStreamId ?? activationLastId,
              replayEntries: replay.entries,
              workspaceId,
            },
            websocketKey,
            websocketProtocol,
            websocketExtensions,
            context,
          )
        })
      } catch (error) {
        if (aborted) {
          state.pendingUpgrades -= 1
          releaseSlot([
            { key: workspaceId, map: state.memberPendingUpgradesByWorkspace },
          ])
          if (activated) {
            streamReader.releaseWorkspace(workspaceId)
          }
          return
        }
        logger.warn(
          { err: error, workspaceId },
          "Realtime socket replay failed",
        )
        try {
          res.cork(() => {
            res.upgrade(
              {
                ...claims,
                activated,
                closeReason: "replay-failed",
                closed: false,
                replayEntries: [],
                workspaceId,
              },
              websocketKey,
              websocketProtocol,
              websocketExtensions,
              context,
            )
          })
        } catch (upgradeError) {
          // `res.upgrade` itself threw — the same uWS footgun the guest
          // catch below already guards against. `open` will now never
          // fire for this connect, so nothing else will ever release
          // these counters; releasing them here mirrors the guest catch
          // instead of leaking them into a permanent false "overloaded"
          // rejection. See PR #1349 round-5 finding (member replay-failed
          // catch).
          logger.warn(
            { err: upgradeError, workspaceId },
            "Realtime socket upgrade after a replay failure also failed",
          )
          state.pendingUpgrades -= 1
          releaseSlot([
            { key: workspaceId, map: state.memberPendingUpgradesByWorkspace },
          ])
          if (activated) {
            streamReader.releaseWorkspace(workspaceId)
          }
        }
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
    state.pendingUpgrades -= 1
    if (socketData.overloadRetryAfterMs !== undefined) {
      counters.overloadCloses += 1
      socketData.closed = true
      socket.end(
        REALTIME_CLOSE_CODE.overloaded,
        JSON.stringify({ retryAfter: socketData.overloadRetryAfterMs }),
      )
      return
    }
    state.activeConnections += 1
    state.peakConnections = Math.max(
      state.peakConnections,
      state.activeConnections,
    )
    counters.upgrades += 1
    releaseSlot([
      {
        key: socketData.workspaceId,
        map: state.memberPendingUpgradesByWorkspace,
      },
    ])
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
    const gapEntries = streamReader
      .getRecentEntries(socketData.workspaceId, socketData.replayCutoff)
      .filter((entry) => entry.record.workspaceId === socketData.workspaceId)
    if (!delivery.replayWorkspaceSocket(socket, gapEntries)) {
      return
    }
    // An invalid record for this shard can arrive while THIS socket's
    // upgrade is still pending (activation + replay already completed,
    // `open` not yet reached): `onInvalidRecord`'s resync only reaches
    // sockets already registered with `delivery` at the moment it
    // fires, so a still-pending upgrade like this one was never told.
    // Catch it here instead, before the cursor this socket is about to
    // hand the client claims everything up to `replayCutoff` is clean.
    // See PR #1349 round-5 finding (pending-upgrade gap).
    const taintedUpToId = streamReader.getTaintedUpToId(socketData.workspaceId)
    if (
      taintedUpToId &&
      (!socketData.replayCutoff ||
        isRealtimeSeqAfter(taintedUpToId, socketData.replayCutoff))
    ) {
      socketData.closed = true
      socket.end(REALTIME_CLOSE_CODE.resync, "malformed-stream-record")
      return
    }
    // Lets a reconnect that processes zero live batches during this
    // connection's lifetime still have a real stream cursor instead of
    // falling back to a synthetic `"0-0"` on its next reconnect — which
    // would otherwise force a full `invalidateQueries()` resync on every
    // quiet-tab lifetime rotation. See PR #1349 finding #2.
    if (socketData.replayCutoff) {
      delivery.sendCursor(socket, socketData.replayCutoff)
    }
    // Free the parsed replay payload (up to `MAX_REPLAY_ENTRIES` full
    // events) once it's been used — it's otherwise retained for this
    // socket's entire connection lifetime for no reason. See PR #1349
    // finding #6.
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
    const lifetimeTimer = state.workspaceLifetimeTimers.get(socketData)
    clearTimeout(lifetimeTimer)
    state.workspaceLifetimeTimers.delete(socketData)
    // Only release the shard this socket actually activated: if
    // `activateWorkspace` itself threw during upgrade, `activated` stays
    // false and this socket never incremented the shard's `socketCount`
    // — releasing here would underflow it and deactivate a shard other
    // live sockets still depend on.
    if (socketData.activated) {
      streamReader.releaseWorkspace(socketData.workspaceId)
    }
    if (delivery.removeWorkspaceSocket(socket)) {
      removeConnectedUser(socketData.workspaceId, socketData.userId)
    }
  },
})
